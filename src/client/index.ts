export { Client } from './typings';

import * as _ from 'lodash';

import {
  createEmitter,
  createEmitterMap,
  Field,
  Obj,
  QueryRequest,
  QueryResponse,
} from '../core';

import parseQuery from './parseQuery';
import queryRequests from './queryRequests';
import readLayer from './readLayer';
import { setClient, setServer } from './set';
import { Client, ClientState, DataChanges } from './typings';

export type AuthFetch = (
  url: string,
  body: QueryRequest[],
) => Promise<QueryResponse[]>;

export default async function buildClient(
  url: string,
  authFetch: AuthFetch,
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

  let requestQueue: {
    request: QueryRequest;
    resolve: (firstIds: Obj<Obj<string>>) => void;
  }[] = [];
  const processQueue = _.throttle(
    async () => {
      const batch = requestQueue;
      requestQueue = [];
      const responses = await authFetch(
        url,
        batch.map(b => ({ ...b.request, normalize: true })),
      );
      setServer(schema, state, responses[0].data);
      batch.forEach((b, i) => b.resolve(responses[i].firstIds!));
    },
    100,
    { leading: false },
  );
  const batchFetch = async (requests: QueryRequest[]) => {
    const promises = requests.map(
      request =>
        new Promise<Obj<Obj<string>>>(resolve =>
          requestQueue.push({ request, resolve }),
        ),
    );
    processQueue();
    return await Promise.all(promises);
  };

  const getEmitter = createEmitterMap<any>();
  const readEmitter = createEmitter<DataChanges>();
  const emitChanges = (changes: DataChanges) => {
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        const v1 = state.combined[type];
        getEmitter.emit(type, v1);
        for (const id of Object.keys(changes[type])) {
          const v2 = v1 && v1[id];
          getEmitter.emit(`${type}.${id}`, v2);
          for (const field of Object.keys(changes[type][id])) {
            const v3 = v2 && v2[field];
            getEmitter.emit(`${type}.${id}.${field}`, v3);
          }
        }
      }
      getEmitter.emit('', state.combined);
      readEmitter.emit(changes);
    }
  };

  return {
    get(...args) {
      if (args.length === 0) return state.combined;
      if (typeof args[args.length - 1] === 'string') {
        return _.get(state.combined, args.join('.'));
      }
      const listener = args.pop();
      const key = args.join('.');
      listener(key ? _.get(state.combined, key) : state.combined);
      return getEmitter.watch(key, listener);
    },

    set(...args) {
      emitChanges(setClient(state, args));
    },

    query(...args) {
      const [queryString, variables, idsOnly, listener] = args as [
        string,
        Obj,
        boolean,
        ((value: Obj | symbol) => void) | undefined
      ];

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
          listener(Symbol.for('loading'));
        }
        const requests = queryRequests(state, info, variables, trace, ids);
        if (requests.length > 0) {
          liveFetches += 1;
          const response = (await batchFetch(requests))[0];
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
      const unlisten = readEmitter.watch(changes => {
        if (!rootUpdaters || rootUpdaters.some(updater => updater(changes))) {
          rootUpdaters = null;
          runFetch();
        } else if (listener && running) {
          listener(value);
        }
      });

      if (!listener) return firstPromise;
      return () => {
        running = false;
        unlisten();
      };
    },
  } as any;

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
