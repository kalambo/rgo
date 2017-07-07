import { Obj } from 'mishmash';
import * as _ from 'lodash';
import { DocumentNode } from 'graphql';
import graphql from 'graphql-anywhere';

import { Field, noUndef } from '../../core';

import resolver from './resolver';

export default function createStore() {
  const state = {
    server: {} as any,
    client: {} as any,
    combined: {} as any,
  };

  const listeners = {} as Obj<((value) => void)[]>;
  function get(type: string): Obj<Obj<any>>;
  function get(type: string, id: string): Obj<any>;
  function get(type: string, id: string, field: string): any;
  function get(type: string, listener: ((value) => void)): void;
  function get(type: string, id: string, listener: ((value) => void)): void;
  function get(
    type: string,
    id: string,
    field: string,
    listener: ((value) => void),
  ): void;
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

    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(listener);

    return () => {
      listeners[key] = listeners[key].filter(l => l !== listener);
      if (listeners[key].length === 0) delete listeners[key];
    };
  }

  function read(
    schema: Obj<Obj<Field>>,
    query: DocumentNode,
    variables: Obj<any>,
    user: string | null,
  ) {
    return graphql(
      resolver,
      query,
      null,
      { schema, user, data: state.combined },
      variables,
    );
  }

  function emitChanges(changes: Obj<Obj<Obj<true>>>) {
    for (const type of Object.keys(changes)) {
      const v1 = state.combined[type];
      listeners[type].forEach(l => l(v1));
      for (const id of Object.keys(changes[type])) {
        const v2 = v1[id];
        listeners[`${type}.${id}`].forEach(l => l(v2));
        for (const field of Object.keys(changes[type][id])) {
          const v3 = v2[field];
          listeners[`${type}.${id}.${field}`].forEach(l => l(v3));
        }
      }
    }
  }

  function set(value: Obj<Obj<Obj<any>>>): void;
  function set(type: string, value: Obj<Obj<any>>): void;
  function set(type: string, id: string, value: Obj<any>): void;
  function set(type: string, id: string, field: string, value: any): void;
  function set(...args) {
    const changes = {} as Obj<Obj<Obj<true>>>;

    const v1 = args[args.length - 1];
    const types = args.length > 1 ? [args[0] as string] : Object.keys(v1);
    for (const type of types) {
      state.client[type] = state.client[type] || {};
      state.combined[type] = state.combined[type] || {};
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

  function setServer(value: Obj<Obj<Obj<any>>>) {
    const changes = {} as Obj<Obj<Obj<true>>>;

    for (const type of Object.keys(value)) {
      state.server[type] = state.server[type] || {};
      state.combined[type] = state.combined[type] || {};
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
