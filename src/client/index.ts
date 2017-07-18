import { createEmitter, createEmitterMap, keysToObject, Obj } from 'mishmash';
import * as _ from 'lodash';
import {
  ArgumentNode,
  OperationDefinitionNode,
  FieldNode,
  StringValueNode,
} from 'graphql';

import { Args, Data } from '../core';

import graphApi, { AuthFetch } from './graphApi';
import prepareQuery from './prepareQuery';
import runRelation from './runRelation';
import { setClient, setServer } from './set';
import { ClientState, Changes, DataChanges } from './typings';

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

export default async function client(
  url: string,
  authFetch: AuthFetch,
  initial: { server?: Data; client?: Data } = {},
) {
  const api = await graphApi(url, authFetch);

  const state: ClientState = {
    server: _.cloneDeep(initial.server || {}),
    client: _.cloneDeep(initial.client || {}),
    combined: _.merge({}, initial.server, initial.client),
    diff: {},
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

  function get(): Data;
  function get(type: string): Obj<Obj>;
  function get(type: string, id: string): Obj;
  function get(type: string, id: string, field: string): any;
  function get(listener: (value: Data) => void): () => void;
  function get(type: string, listener: (value: Obj<Obj>) => void): () => void;
  function get(
    type: string,
    id: string,
    listener: (value: Obj) => void,
  ): () => void;
  function get(
    type: string,
    id: string,
    field: string,
    listener: (value: any) => void,
  ): () => void;
  function get(...args) {
    if (args.length === 0) return state.combined;
    if (typeof args[args.length - 1] === 'string') {
      return _.get(state.combined, args.join('.'));
    }
    const listener = args.pop();
    const key = args.join('.');
    listener(key ? _.get(state.combined, key) : state.combined);
    return getEmitter.watch(key, listener);
  }

  function set(value: Obj<Obj<Obj | null | undefined> | undefined>): void;
  function set(
    type: string,
    value: Obj<Obj | null | undefined> | undefined,
  ): void;
  function set(type: string, id: string, value: Obj | null | undefined): void;
  function set(type: string, id: string, field: string, value: any): void;
  function set(...args) {
    emitChanges(setClient(state, args));
  }

  function query(
    queryString: string,
    variables: Obj,
    idsOnly: boolean,
  ): Promise<Obj>;
  function query(
    queryString: string,
    variables: Obj,
    idsOnly: boolean,
    listener: (value: Obj | symbol) => void,
  ): () => void;
  function query(...args) {
    const [queryString, variables, idsOnly, listener] = args as [
      string,
      Obj,
      boolean,
      ((value: Obj | symbol) => void) | undefined
    ];

    const { apiQuery, readQuery } = prepareQuery(
      api.schema,
      state.combined,
      state.diff,
      queryString,
      variables,
      idsOnly,
    );

    let unlisten: boolean | (() => void)[] = false;
    if (listener) listener(loading);

    const run = async () => {
      const serverData = await api.query(apiQuery, variables);
      setServer(state, serverData);
      const fieldNodes = (readQuery.definitions[0] as OperationDefinitionNode)
        .selectionSet.selections as FieldNode[];
      const value = {};
      if (!unlisten)
        unlisten = fieldNodes.map(node =>
          runRelation(
            { field: node.name.value, records: { '': value } },
            { type: node.name.value, isList: true },
            buildArgs(node.arguments, variables),
            node.selectionSet!.selections as FieldNode[],
            {
              data: state.combined,
              schema: api.schema,
              userId: null,
              variables,
            },
            listener && readEmitter.watch,
          ),
        );
      if (listener) listener(value);
      return value;
    };

    if (!listener) return run();
    return () =>
      typeof unlisten === 'function' ? unlisten() : (unlisten = true);
  }

  return {
    get,
    set,
    query,
  };

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
