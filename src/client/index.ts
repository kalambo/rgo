export { Client } from './typings';

import * as _ from 'lodash';

import {
  createEmitter,
  createEmitterMap,
  Field,
  Obj,
  QueryResult,
} from '../core';

import parseQuery from './parseQuery';
import queryRequests from './queryRequests';
import readLayer from './readLayer';
import { setClient, setServer } from './set';
import { Client, ClientState, Changes, DataChanges } from './typings';

export type AuthFetch = (url: string, body: any[]) => Promise<QueryResult>;

// const allKeys = (objects: any[]) =>
//   Array.from(
//     new Set(objects.reduce((res, o) => [...res, ...Object.keys(o)], [])),
//   ) as string[];

// const isReadonly = (field: Field) => {
//   if (fieldIs.scalar(field)) return !!field.formula;
//   return fieldIs.foreignRelation(field);
// };

export default async function buildClient(
  url: string,
  authFetch: AuthFetch,
): Promise<Client> {
  const schema: Obj<Obj<Field>> = await (await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ query: '{ SCHEMA }' }]),
  })).json();
  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };

  let requestQueue: { body: any; resolve: (result: any) => void }[] = [];
  const processQueue = _.throttle(
    async () => {
      const batch = requestQueue;
      requestQueue = [];
      const { firstIds, data } = await authFetch(url, batch.map(b => b.body));
      setServer(schema, state, data);
      batch.forEach((b, i) => b.resolve(firstIds[i]));
    },
    100,
    { leading: false },
  );
  const batchFetch = async (bodies: any[]) => {
    const requests = bodies.map(
      body =>
        new Promise<Obj<Obj<string>>>(resolve =>
          requestQueue.push({ body, resolve }),
        ),
    );
    processQueue();
    return await Promise.all(requests);
  };

  const getEmitter = createEmitterMap<any>();
  const readEmitter = createEmitter<Changes>();
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
      readEmitter.emit({ changes, rootChanges: { added: [], removed: [] } });
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

      let unlisten: boolean | (() => void)[] = false;
      if (listener) listener(Symbol.for('loading'));

      const result = (async () => {
        const info = parseQuery(schema, queryString, variables, idsOnly);
        const [firstIds] = await batchFetch(
          queryRequests(state, info, variables),
        );

        const value = {};
        if (!unlisten) {
          unlisten = info.layers.map(layer =>
            readLayer(
              layer,
              { '': value },
              state,
              firstIds,
              listener && readEmitter.watch,
            ),
          );
        }
        if (listener) listener(value);
        return value;
      })();

      if (!listener) return result;
      return () =>
        typeof unlisten === 'function' ? unlisten() : (unlisten = true);
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
