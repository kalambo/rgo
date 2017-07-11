import { Obj } from 'mishmash';
import * as _ from 'lodash';
import { DocumentNode } from 'graphql';

import { Field, noUndef } from '../core';

import readData from './read';

const createListeners = () => {
  const listeners: Obj<((value: any) => void)[]> = {};
  return {
    add(key: string, listener: (value: any) => void) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(listener);
      return () => {
        listeners[key] = listeners[key].filter(l => l !== listener);
        if (listeners[key].length === 0) delete listeners[key];
      };
    },
    emit(key: string, value: any) {
      if (listeners[key]) listeners[key].forEach(l => l(value));
    },
  };
};

export default function createStore(schema: Obj<Obj<Field>>) {
  const state = {
    server: {} as Obj<Obj<Obj>>,
    client: {} as Obj<Obj<Obj>>,
    combined: {} as Obj<Obj<Obj>>,
  };

  const getListeners = createListeners();
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
    return getListeners.add(key, listener);
  }

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
    const result = readData(
      queryDoc,
      {
        schema,
        userId,
        variables,
      },
      state.combined,
      listener,
    );
    if (!listener) return result;
  }

  function emitChanges(changes: Obj<Obj<Obj<true>>>) {
    for (const type of Object.keys(changes)) {
      const v1 = state.combined[type];
      getListeners.emit(type, v1);
      for (const id of Object.keys(changes[type])) {
        const v2 = v1[id];
        getListeners.emit(`${type}.${id}`, v2);
        for (const field of Object.keys(changes[type][id])) {
          const v3 = v2[field];
          getListeners.emit(`${type}.${id}.${field}`, v3);
        }
      }
    }
  }

  function set(value: Obj<Obj<Obj>>): void;
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

  function setServer(value: Obj<Obj<Obj>>) {
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
