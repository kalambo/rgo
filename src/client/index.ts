export { Client } from './typings';

import * as _ from 'lodash';
import {
  ArgumentNode,
  OperationDefinitionNode,
  FieldNode,
  StringValueNode,
} from 'graphql';

import {
  Args,
  createEmitter,
  createEmitterMap,
  keysToObject,
  Obj,
} from '../core';

import graphApi, { AuthFetch } from './graphApi';
import prepareQuery from './prepareQuery';
import runRelation from './runRelation';
import { setClient, setServer } from './set';
import { Client, ClientState, Changes, DataChanges } from './typings';

const loading = Symbol('loading');

export const buildArgs = (args: ArgumentNode[] = [], variables: Obj): Args =>
  keysToObject(
    args,
    ({ value }) => {
      if (value.kind === 'Variable') return variables[value.name.value];
      if (value.kind === 'IntValue') return parseInt(value.value, 10);
      return (value as StringValueNode).value;
    },
    ({ name }) => name.value,
  );

export default async function buildClient(
  url: string,
  authFetch: AuthFetch,
): Promise<Client> {
  const api = await graphApi(url, authFetch);

  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };

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

      const { apiQuery, layers, readQuery } = prepareQuery(
        api.schema,
        queryString,
        variables,
        idsOnly,
      );
      const readNodes = (readQuery.definitions[0] as OperationDefinitionNode)
        .selectionSet.selections as FieldNode[];

      let unlisten: boolean | (() => void)[] = false;
      if (listener) listener(loading);

      const result = (async () => {
        const layerKeys = Object.keys(layers);
        const layersExtra = keysToObject(layerKeys, path =>
          layers[path].extra(state),
        );
        const rootVariables = {
          ...variables,
          ...keysToObject(layerKeys, path => layersExtra[path].slice),
        };
        const queryData = await api.query([
          { query: apiQuery, variables: rootVariables },
          ...layerKeys
            .filter(path => layersExtra[path].ids.length > 0)
            .map(path => ({
              query: layers[path].query,
              variables: { ...rootVariables, ids: layersExtra[path].ids },
            })),
        ]);
        queryData.forEach(d => setServer(state, api.normalize(d)));

        const value = {};
        if (!unlisten)
          unlisten = readNodes.map(node =>
            runRelation(
              { field: node.name.value, records: { '': value } },
              { type: node.name.value, isList: true },
              buildArgs(node.arguments, variables),
              node.selectionSet!.selections as FieldNode[],
              { '': queryData[0]![node.name.value] },
              node.name.value,
              {
                state,
                schema: api.schema,
                userId: null,
                variables,
                extra: layersExtra,
              },
              listener && readEmitter.watch,
            ),
          );
        if (listener) listener(value);
        return value;
      })();

      if (!listener) return result;
      return () =>
        typeof unlisten === 'function' ? unlisten() : (unlisten = true);
    },
  } as any;

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
