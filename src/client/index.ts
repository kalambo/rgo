export { Client, FieldConfig } from './typings';

import * as _ from 'lodash';
import { parse } from 'graphql';

import {
  createEmitter,
  createEmitterMap,
  Data,
  Field,
  fieldIs,
  keysToObject,
  noUndef,
  Obj,
  Rules,
  ScalarField,
  ScalarName,
  validate as validateField,
} from '../core';

import queryLayers from './queryLayers';
import readLayer from './readLayer';
import { setClient, setServer } from './set';
import createWatcher from './watcher';
import {
  AuthFetch,
  Client,
  ClientState,
  DataChanges,
  FieldConfig,
  FieldState,
  QueryOptions,
} from './typings';

export async function buildClient(
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
      watcher.process();
    }
  };

  let queryCounter = 0;
  const watcher = createWatcher(url, authFetch, (data, indices) => {
    emitChanges(setServer(schema, state, data), indices);
  });

  const set = (...args) => emitChanges(setClient(state, args));

  interface FieldInfo {
    scalar: ScalarName;
    isList?: true;
    rules: Rules;
    optional?: true;
    showIf?: Obj;
  }
  const watchFields = <T>(
    config: FieldConfig | FieldConfig[],
    getResult: (info: Obj<FieldInfo>, values: Obj) => T,
    listener?: (value: T) => void,
  ) => {
    const allKeysObj: Obj<true> = {};
    const info = keysToObject<FieldConfig, FieldInfo>(
      Array.isArray(config) ? config : [config],
      ({ key, rules, optional, showIf }) => {
        const [type, id, fieldName] = key.split('.');
        const field = schema[type][fieldName] as ScalarField;
        const allRules = { ...rules || {}, ...field.rules || {} };
        if (field.rules && field.rules.lt) {
          allRules.lt = `${type}.${id}.${field.rules.lt}`;
        }
        if (field.rules && field.rules.gt) {
          allRules.gt = `${type}.${id}.${field.rules.gt}`;
        }
        if (allRules.lt) allKeysObj[allRules.lt] = true;
        if (allRules.gt) allKeysObj[allRules.gt] = true;
        if (Array.isArray(config)) {
          Object.keys(showIf || {}).forEach(k => (allKeysObj[k] = true));
        }
        allKeysObj[key] = true;
        return {
          scalar: field.scalar,
          isList: field.isList,
          rules: allRules,
          optional,
          showIf,
        };
      },
      ({ key }) => key,
    );
    const allKeys = Object.keys(allKeysObj);
    const values = keysToObject(allKeys, key =>
      noUndef(_.get(state.combined, key)),
    );

    if (!listener) return getResult(info, values);
    listener(getResult(info, values));
    if (allKeys.length === 1) {
      return emitterMap.watch(allKeys[0], value => {
        values[allKeys[0]] = value;
        listener(getResult(info, values));
      });
    }
    return emitter.watch(({ changes }) => {
      const changedKeys = allKeys.filter(key => _.get(changes, key));
      if (changedKeys.length > 0) {
        for (const key of changedKeys) {
          values[key] = noUndef(_.get(state.combined, key));
        }
        listener(getResult(info, values));
      }
    }) as any;
  };

  return {
    types: keysToObject(Object.keys(schema), type =>
      keysToObject(Object.keys(schema[type]), fieldName => {
        const field = schema[type][fieldName];
        return fieldIs.scalar(field) ? field.scalar : field.type;
      }),
    ),

    field(field: FieldConfig, listener?: (value: FieldState) => void) {
      return watchFields(
        field,
        (info, values) => ({
          scalar: info[field.key].scalar,
          isList: info[field.key].isList as true | undefined,
          value: values[field.key],
          onChange: value => set(...field.key.split('.'), value),
          invalid: !(
            (values[field.key] === null && info[field.key].optional) ||
            validateField(
              info[field.key].scalar,
              info[field.key].rules,
              values[field.key],
              values,
            )
          ),
        }),
        listener,
      );
    },

    fields(
      fields: FieldConfig[],
      listener?: (value: { invalid: boolean; active: boolean[] }) => void,
    ) {
      return watchFields(
        fields,
        (info, values) => {
          const active = fields.map(
            ({ key }) =>
              info[key].showIf
                ? Object.keys(info[key].showIf!).every(
                    k => values[k] === info[key].showIf![k],
                  )
                : true,
          );
          const invalid = !fields.every(
            ({ key }, i) =>
              !active[i] ||
              (values[key] === null && info[key].optional) ||
              validateField(
                info[key].scalar,
                info[key].rules,
                values[key],
                values,
              ),
          );
          return {
            active,
            invalid,
            // async mutate() {
            //   if (!invalid) await mutate(fields.map(({ key }) => key));
            // },
          };
        },
        listener,
      );
    },

    query(...args) {
      const queryIndex = queryCounter++;

      const queryDoc = parse(args[0]);
      const [options, onLoad, onChange] = (args.length === 3
        ? [undefined, ...args.slice(1)]
        : args.slice(1)) as [
        (QueryOptions & { info?: true }) | undefined,
        ((data: Obj | { data: Obj; spans: Obj } | null) => void) | undefined,
        ((changes: Data) => void) | true | undefined
      ];
      const { variables, idsOnly, info: withInfo } =
        options || ({} as QueryOptions & { info?: true });

      const layers = queryLayers(
        schema,
        queryDoc,
        variables,
        idsOnly,
        withInfo,
      );

      let data = {};
      let spans = {};
      let rootUpdaters:
        | ((changes: DataChanges, update: boolean) => boolean)[]
        | null = null;
      let firstIds: Obj<Obj<string>>;

      let firstResolve: (value: any) => void;
      const firstPromise = new Promise(resolve => (firstResolve = resolve));
      let running = true;

      const updateQuery = watcher.addQuery(
        queryIndex,
        () => {
          if (onLoad && running) onLoad(null);
        },
        newFirstIds => {
          if (newFirstIds) firstIds = newFirstIds;
          data = {};
          spans = {};
          rootUpdaters = layers.map(layer =>
            readLayer(
              layer,
              { '': data },
              state,
              firstIds,
              withInfo && { '': spans },
            ),
          );
          if (withInfo) {
            spans[''] = Math.max(
              ...layers.map(({ root }) =>
                spans[root.field].reduce((res, v) => res + v[''], 0),
              ),
              1,
            );
          }
          firstResolve(withInfo ? { data, spans } : data);
          if (!onLoad) updateQuery();
          else if (running) onLoad(withInfo ? { data, spans } : data);
        },
      );
      updateQuery(layers, state);

      const unlisten = emitter.watch(({ changes, indices }) => {
        if (!indices || !indices.includes(queryIndex)) {
          if (
            !rootUpdaters ||
            rootUpdaters.some(updater => updater(changes, onChange === true))
          ) {
            rootUpdaters = null;
            updateQuery(layers, state);
          } else if (onLoad && running) {
            if (onChange === true) {
              onLoad(data);
            } else {
              onChange!(
                keysToObject(Object.keys(changes), type =>
                  keysToObject(Object.keys(changes[type]), id =>
                    keysToObject(Object.keys(changes[type][id]), field =>
                      noUndef(_.get(state.combined, [type, id, field])),
                    ),
                  ),
                ),
              );
            }
          }
        }
      });

      if (!onLoad) return firstPromise;
      return (() => {
        running = false;
        updateQuery();
        unlisten();
      }) as any;
    },

    set,
  };
}

// const mutate = async (keys: string[]) => {
//   const mutationData = keys.reduce(
//     (res, k) => _.set(res, k, noUndef(_.get(state.combined, k))),
//     {},
//   );
//   const types = Object.keys(mutationData);
//   const mutations = keysToObject(types, type =>
//     Object.keys(mutationData[type]).map(id => ({
//       id,
//       ...keysToObject(Object.keys(mutationData[type][id]), f => {
//         const value = mutationData[type][id][f];
//         const field = schema[type][f];
//         const encode = fieldIs.scalar(field) && scalars[field.scalar].encode;
//         return value === null || !encode ? value : mapArray(value, encode);
//       }),
//     })),
//   );

//   const query = `
//     mutation Mutate(${types.map(t => `$${t}: [${t}Input!]`).join(', ')}) {
//       mutate(${types.map(t => `${t}: $${t}`).join(', ')}) {
//         ${types.map(
//           t => `${t} {
//           ${[
//             ...allKeys(mutations[t]),
//             ...Object.keys(schema[t]).filter(f => {
//               const field = schema[t][f];
//               return fieldIs.scalar(field)
//                 ? !!field.formula
//                 : fieldIs.foreignRelation(field);
//             }),
//             'modifiedat',
//           ]
//             .map(f => (fieldIs.scalar(schema[t][f]) ? f : `${f} { id }`))
//             .join('\n')}
//         }`,
//         )}
//       }
//     }
//   `;
//   await batchFetch([{ query, variables: mutations }]);

//   set(state, keys.reduce((res, k) => _.set(res, k, undefined), {}));
// };
