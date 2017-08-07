export { Client, FieldOptions } from './typings';

import * as _ from 'lodash';

import {
  createEmitter,
  createEmitterMap,
  Field,
  fieldIs,
  keysToObject,
  noUndef,
  Obj,
  QueryRequest,
  QueryResponse,
  Rules,
  ScalarName,
  validate,
} from '../core';

import parseQuery from './parseQuery';
import queryRequests from './queryRequests';
import readLayer from './readLayer';
import { setClient, setServer } from './set';
import {
  Client,
  ClientState,
  DataChanges,
  FieldOptions,
  QueryOptions,
} from './typings';

export type AuthFetch = (
  url: string,
  body: QueryRequest[],
) => Promise<QueryResponse[]>;

export default async function buildClient(
  url: string,
  authFetch: AuthFetch,
  log?: boolean,
): Promise<Client> {
  const schema: Obj<Obj<Field>> = JSON.parse(
    (await (await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ SCHEMA }' }),
    })).json()).data,
  );

  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };

  const emitterMap = createEmitterMap<any>();
  const emitter = createEmitter<{ changes: DataChanges; indices?: number[] }>();
  const emitChanges = (changes: DataChanges, indices?: number[]) => {
    if (log) console.log(state.combined);
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        for (const id of Object.keys(changes[type])) {
          for (const field of Object.keys(changes[type][id])) {
            emitterMap.emit(
              `${type}.${id}.${field}`,
              noUndef(_.get(state.combined, [type, id, field])),
            );
          }
        }
      }
      emitter.emit({ changes, indices });
    }
  };

  const set = (...args) => emitChanges(setClient(state, args));

  let requestQueue: {
    request: QueryRequest;
    resolve: (firstIds: Obj<Obj<string>>) => void;
    index: number;
  }[] = [];
  const processQueue = _.throttle(
    async () => {
      const batch = requestQueue;
      requestQueue = [];
      const responses = await authFetch(
        url,
        batch.map(b => ({ ...b.request, normalize: true })),
      );
      emitChanges(
        setServer(schema, state, responses[0].data),
        Array.from(new Set(batch.map(({ index }) => index))),
      );
      batch.forEach((b, i) => b.resolve(responses[i].firstIds!));
    },
    100,
    { leading: false },
  );
  const batchFetch = async (requests: QueryRequest[], index: number) => {
    const promises = requests.map(
      request =>
        new Promise<Obj<Obj<string>>>(resolve =>
          requestQueue.push({ request, resolve, index }),
        ),
    );
    processQueue();
    return await Promise.all(promises);
  };

  let queryCount = 0;
  return {
    field(
      fields: FieldOptions | FieldOptions[],
      listener?: (value: any) => void,
    ) {
      const fieldsArray = Array.isArray(fields) ? fields : [fields];

      const keysObj: Obj<true> = {};
      const allKeysObj: Obj<true> = {};
      const infoObj: Obj<{
        scalar: ScalarName;
        isList?: true;
        rules: Rules;
        optional?: true;
        showIf?: Obj;
      }> = {};
      for (const { key, rules, optional, showIf } of fieldsArray) {
        const field = schema[key[0]][key[2]];
        if (fieldIs.scalar(field)) {
          const allRules = { ...rules || {}, ...field.rules || {} };
          if (field.rules && field.rules.lt) {
            allRules.lt = `${key[0]}.${key[1]}.${field.rules.lt}`;
          }
          if (field.rules && field.rules.gt) {
            allRules.gt = `${key[0]}.${key[1]}.${field.rules.gt}`;
          }

          if (allRules.lt) allKeysObj[allRules.lt] = true;
          if (allRules.gt) allKeysObj[allRules.gt] = true;
          Object.keys(showIf || {}).forEach(k => (allKeysObj[k] = true));

          const keyString = key.join('.');
          keysObj[keyString] = true;
          allKeysObj[keyString] = true;
          infoObj[keyString] = {
            scalar: field.scalar,
            isList: field.isList,
            rules: allRules,
            optional,
            showIf,
          };
        }
      }

      const allKeys = Object.keys(allKeysObj);
      const values = keysToObject(allKeys, key =>
        noUndef(_.get(state.combined, key)),
      );

      const keys = Object.keys(keysObj);
      const getResult = () => {
        const showing = keys.map(
          key =>
            infoObj[key].showIf
              ? Object.keys(infoObj[key].showIf).every(
                  k => values[k] === infoObj[key].showIf![k],
                )
              : true,
        );
        const invalid = !keys.every(
          (key, i) =>
            !showing[i] ||
            (values[key] === null && infoObj[key].optional) ||
            validate(
              infoObj[key].scalar,
              infoObj[key].rules,
              values[key],
              values,
            ),
        );
        return Array.isArray(fields)
          ? { invalid, showing }
          : {
              scalar: infoObj[keys[0]].scalar,
              isList: infoObj[keys[0]].isList,
              value: values[keys[0]],
              onChange: value => set(...fields.key, value),
              invalid,
            };
      };

      if (!listener) return getResult();
      listener(getResult());
      if (allKeys.length === 1) {
        return emitterMap.watch(allKeys[0], value => {
          values[allKeys[0]] = value;
          listener(getResult());
        });
      }
      return emitter.watch(({ changes }) => {
        const changedKeys = allKeys.filter(key => _.get(changes, key));
        if (changedKeys.length > 0) {
          for (const key of changedKeys) {
            values[key] = noUndef(_.get(state.combined, key));
          }
          listener(getResult());
        }
      }) as any;
    },

    query(...args) {
      const queryIndex = queryCount++;

      const hasListener = typeof args[args.length - 1] === 'function';
      const queryString: string = args[0];
      const { variables, idsOnly }: QueryOptions =
        (!hasListener || args.length === 3 ? args[1] : undefined) || {};
      const listener: ((value: Obj | null) => void) | undefined = hasListener
        ? args[args.length - 1]
        : undefined;

      let value = {};
      const info = parseQuery(schema, queryString, variables, idsOnly);
      let rootUpdaters: ((changes: DataChanges) => boolean)[] | null = null;
      const trace: Obj<{ start: number; end?: number }> = {};
      const ids: Obj<string[]> = {};
      let firstIds: Obj<Obj<string>>;

      let firstResolve: (value: any) => void;
      const firstPromise = new Promise(resolve => (firstResolve = resolve));
      let running = true;

      let liveFetches = 0;
      const runFetch = async () => {
        if (listener && liveFetches === 0) {
          listener(null);
        }
        const requests = queryRequests(state, info, variables, trace, ids);
        if (requests.length > 0) {
          liveFetches += 1;
          const response = (await batchFetch(requests, queryIndex))[0];
          if (!requests[0].variables.ids) firstIds = response;
          liveFetches -= 1;
        }
        if (liveFetches === 0) {
          value = {};
          rootUpdaters = info.layers.map(layer =>
            readLayer(layer, { '': value }, state, firstIds),
          );
          firstResolve(value);
          if (listener && running) listener(value);
        }
      };

      runFetch();
      const unlisten = emitter.watch(({ changes, indices }) => {
        if (!indices || !indices.includes(queryIndex)) {
          if (!rootUpdaters || rootUpdaters.some(updater => updater(changes))) {
            rootUpdaters = null;
            runFetch();
          } else if (listener && running) {
            listener(value);
          }
        }
      });

      if (!listener) return firstPromise;
      return (() => {
        running = false;
        unlisten();
      }) as any;
    },

    set,
  };

  // async mutate(data: any) {
  //     const typesNames = Object.keys(data);
  //     const mutations = keysToObject(typesNames, type =>
  //       Object.keys(data[type]).map(id => ({
  //         id,
  //         ...keysToObject(Object.keys(data[type][id]), f => {
  //           const value = data[type][id][f];
  //           const field = schema[type][f];
  //           const encode =
  //             fieldIs.scalar(field) && scalars[field.scalar].encode;
  //           return value === null || !encode ? value : mapArray(value, encode);
  //         }),
  //       })),
  //     );

  //     const query = `
  //       mutation Mutate(${typesNames
  //         .map(t => `$${t}: [${t}Input!]`)
  //         .join(', ')}) {
  //         mutate(${typesNames.map(t => `${t}: $${t}`).join(', ')}) {
  //           ${typesNames.map(
  //             t => `${t} {
  //             ${[
  //               ...allKeys(mutations[t]),
  //               ...Object.keys(schema[t]).filter(f => isReadonly(schema[t][f])),
  //               'modifiedAt',
  //             ]
  //               .map(f => (fieldIs.scalar(schema[t][f]) ? f : `${f} { id }`))
  //               .join('\n')}
  //           }`,
  //           )}
  //         }
  //       }
  //     `;

  //     const [result] = await batchFetch([{ query, variables: mutations }]);
  //     return result && result.mutate;
  //   },

  // async function mutate(keys: DataKey[]) {
  //   const mutationData = keys.reduce(
  //     (res, k) =>
  //       set(keyToArray(k), get(keyToArray(k), currentState.combined), res),
  //     {},
  //   );

  //   const clearedClient = !keys
  //     ? {}
  //     : keys.reduce(
  //         (res, k) => set(keyToArray(k), undefined, res),
  //         currentState.client,
  //       );

  //   const prevServer = currentState.server;
  //   const optimisticServer = merge(prevServer, mutationData);
  //   setState({
  //     server: optimisticServer,
  //     client: clearedClient,
  //     combined: merge(optimisticServer, clearedClient),
  //   });

  //   const result = await api.mutate(mutationData);
  //   const finalServer = result ? merge(prevServer, result) : prevServer;
  //   setState({
  //     server: finalServer,
  //     client: clearedClient,
  //     combined: merge(finalServer, clearedClient),
  //   });
  // }

  // return {
  //   get: store.get,
  //   query,
  //   // mutate,
  // };
}

// const allKeys = (objects: any[]) =>
//   Array.from(
//     new Set(objects.reduce((res, o) => [...res, ...Object.keys(o)], [])),
//   ) as string[];

// const isReadonly = (field: Field) => {
//   if (fieldIs.scalar(field)) return !!field.formula;
//   return fieldIs.foreignRelation(field);
// };
