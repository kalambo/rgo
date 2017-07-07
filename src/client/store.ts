import { Obj } from 'mishmash';
import * as _ from 'lodash';
import * as orderBy from 'lodash/fp/orderBy';
import { DocumentNode } from 'graphql';
import graphql from 'graphql-anywhere';

import {
  Field,
  fieldIs,
  ForeignRelationField,
  noUndef,
  parseArgs,
  RelationField,
} from '../core';

const toArray = x => (Array.isArray(x) ? x : [x]);

const filterRecord = (filter: any, record: any) => {
  const key = Object.keys(filter)[0];

  if (key === '$and')
    return (filter[key] as any[]).every(b => filterRecord(b, record));
  if (key === '$or')
    return (filter[key] as any[]).some(b => filterRecord(b, record));

  const op = Object.keys(filter[key])[0];

  if (op === '$eq') return record[key] === filter[key][op];
  if (op === '$ne') return record[key] !== filter[key][op];
  if (op === '$lt') return record[key] < filter[key][op];
  if (op === '$lte') return record[key] <= filter[key][op];
  if (op === '$gt') return record[key] > filter[key][op];
  if (op === '$gte') return record[key] >= filter[key][op];
  if (op === '$in') return filter[key][op].includes(record[key]);

  return false;
};

export default function createStore(schema: Obj<Obj<Field>>) {
  const state = {
    server: {} as any,
    client: {} as any,
    combined: {} as any,
  };

  const listeners = {} as Obj<((value) => void)[]>;
  function get(type: string): Obj<Obj<any>>;
  function get(type: string, id: string): Obj<any>;
  function get(type: string, id: string, field: string): any;
  function get(
    type: string,
    listener: (value: Obj<Obj<any>>) => void,
  ): () => void;
  function get(
    type: string,
    id: string,
    listener: (value: Obj<any>) => void,
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

    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(listener);

    return () => {
      listeners[key] = listeners[key].filter(l => l !== listener);
      if (listeners[key].length === 0) delete listeners[key];
    };
  }

  function getData(
    field: ForeignRelationField | RelationField | string,
    args: any,
    userId: string | null,
    values: { id: string; field: any },
  ) {
    const type = typeof field === 'string' ? field : field.relation.type;

    const { filter, sort, skip, show } = parseArgs(args, userId, schema[type]);
    const relationFilters = typeof field !== 'string' && [
      { id: { $in: toArray(values.field) } },
      ...(field.relation.field
        ? [{ [field.relation.field]: { $eq: values.id } }]
        : []),
    ];
    const sorted = orderBy(
      Object.keys(sort),
      Object.keys(sort).map(k => (sort[k] === 1 ? 'asc' : 'desc')),
      Object.keys(state.combined[type])
        .map(id => state.combined[type][id])
        .filter(x =>
          filterRecord(
            field ? { $and: [filter, { $or: relationFilters }] } : filter,
            x,
          ),
        ),
    ) as any[];

    const result = sorted.map(x => ({ __typename: type, ...x }));
    const isList =
      typeof field === 'string' ||
      fieldIs.foreignRelation(field) ||
      field.isList;
    return isList
      ? result.slice(skip, show === null ? undefined : skip + show)
      : result[0] || null;
  }
  function resolver(
    fieldName: string,
    root: any,
    args: any,
    { userId }: { userId: string | null },
  ) {
    const field = root ? schema[root.__typename][fieldName] : null;
    if (field && fieldIs.scalar(field)) return root[fieldName];
    return getData(field || fieldName, args, userId, {
      id: root.id,
      field: root[fieldName],
    });
  }
  function read(
    queryDoc: DocumentNode,
    variables: Obj<any>,
    userId: string | null,
  ): Obj<any>;
  function read(
    queryDoc: DocumentNode,
    variables: Obj<any>,
    userId: string | null,
    listener: (value: Obj<any>) => void,
  ): () => void;
  function read(...args) {
    const [queryDoc, variables, userId, listener] = args as [
      DocumentNode,
      Obj<any>,
      string | null,
      ((value: Obj<any>) => void) | undefined
    ];
    const result = graphql(resolver, queryDoc, null, { userId }, variables);
    if (!listener) return result;
    listener(result);
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
