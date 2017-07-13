import { Obj } from 'mishmash';
import * as _ from 'lodash';
import { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

import { Field, noUndef } from '../core';

import runRelation from './runRelation';
import { Changes, createEmitter, createEmitterMap, Data } from './utils';

export default function createStore(schema: Obj<Obj<Field>>) {
  const state = {
    server: {} as Data,
    client: {} as Data,
    combined: {} as Data,
  };

  const getEmitter = createEmitterMap();
  function get(type: string): Obj<Obj>;
  function get(type: string, id: string): Obj;
  function get(type: string, id: string, field: string): any;
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
    if (typeof args[args.length - 1] === 'string') {
      const key = args.join('.');
      return noUndef(_.get(state.combined, key), args.length === 3 ? null : {});
    }
    const listener = args.pop();
    const key = args.join('.');
    listener(
      noUndef(_.get(state.combined, key), args.length === 3 ? null : {}),
    );
    return getEmitter.watch(key, listener);
  }

  const readEmitter = createEmitter<Changes>();
  function read(
    queryDoc: DocumentNode,
    variables: Obj,
    userId: string | null,
  ): Obj;
  function read(
    queryDoc: DocumentNode,
    variables: Obj,
    userId: string | null,
    listener: (value: Obj) => void,
  ): () => void;
  function read(...args) {
    const [queryDoc, variables, userId, listener] = args as [
      DocumentNode,
      Obj,
      string | null,
      ((value: Obj) => void) | undefined
    ];
    const fieldNodes = (queryDoc.definitions[0] as OperationDefinitionNode)
      .selectionSet.selections as FieldNode[];
    const value = {};
    const stopRelations = fieldNodes.map(node =>
      runRelation(
        { record: value },
        node.name.value,
        node.name.value,
        true,
        null,
        node.arguments,
        node.selectionSet!.selections as FieldNode[],
        {
          data: state.combined,
          schema,
          userId,
          variables,
        },
        listener && readEmitter.watch,
      ),
    );
    if (!listener) return value;
    listener(value);
    return () => stopRelations.forEach(s => s());
  }

  function emitChanges(changes: Obj<Obj<Obj<true>>>) {
    for (const type of Object.keys(changes)) {
      const v1 = state.combined[type];
      getEmitter.emit(type, v1);
      for (const id of Object.keys(changes[type])) {
        const v2 = v1[id];
        getEmitter.emit(`${type}.${id}`, v2);
        for (const field of Object.keys(changes[type][id])) {
          const v3 = v2[field];
          getEmitter.emit(`${type}.${id}.${field}`, v3);
        }
      }
    }
    readEmitter.emit({ changes, rootChanges: { added: [], removed: [] } });
  }

  function set(value: Data): void;
  function set(type: string, value: Obj<Obj>): void;
  function set(type: string, id: string, value: Obj): void;
  function set(type: string, id: string, field: string, value: any): void;
  function set(...args) {
    const changes = {} as Obj<Obj<Obj<true>>>;

    const v1 = args[args.length - 1];
    const types = args.length > 1 ? [args[0] as string] : Object.keys(v1);
    for (const type of types) {
      state.client[type] = state.client[type] || {};
      state.combined[type] = state.combined[type] || { __typename: type };
      changes[type] = changes[type] || {};
      const v2 = args.length <= 1 ? v1[type] : v1;
      const ids = args.length > 2 ? [args[1] as string] : Object.keys(v2);
      for (const id of ids) {
        state.client[type][id] = state.client[type][id] || {};
        state.combined[type][id] = state.combined[type][id] || {};
        changes[type][id] = changes[type][id] || {};
        const v3 = args.length <= 2 ? v2[id] : v2;
        const fields = args.length > 3 ? [args[2] as string] : Object.keys(v3);
        for (const field of fields) {
          state.client[type][id][field] = v3;
          if (v3 !== noUndef(state.combined[type][id][field])) {
            state.combined[type][id][field] = v3;
            changes[type][id][field] = true;
          }
        }
      }
    }

    emitChanges(changes);
  }

  function setServer(value: Data) {
    const changes = {} as Obj<Obj<Obj<true>>>;

    for (const type of Object.keys(value)) {
      state.server[type] = state.server[type] || {};
      state.combined[type] = state.combined[type] || { __typename: type };
      changes[type] = changes[type] || {};
      for (const id of Object.keys(value[type])) {
        state.server[type][id] = state.server[type][id] || {};
        state.combined[type][id] = state.combined[type][id] || {};
        changes[type][id] = changes[type][id] || {};
        for (const field of Object.keys(value[type][id])) {
          state.server[type][id][field] = value[type][id][field];
          if (
            (state.client[type] &&
              state.client[type][id] &&
              state.client[type][id][field]) === undefined
          ) {
            state.combined[type][id][field] = value[type][id][field];
            changes[type][id][field] = true;
          }
        }
      }
    }

    emitChanges(changes);
  }

  return {
    get,
    read,
    set,
    setServer,
  };
}
