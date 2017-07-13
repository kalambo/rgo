import { keysToObject, Obj } from 'mishmash';
import { ArgumentNode, IntValueNode, StringValueNode } from 'graphql';

import { Field, fieldIs, ForeignRelationField, RelationField } from '../core';

export type Data = Obj<Obj<Obj>>;

export interface ReadContext {
  data: Data;
  schema: Obj<Obj<Field>>;
  userId: string | null;
  variables: Obj;
}

export interface Changes {
  changes: Data;
  rootChanges: {
    added: string[];
    removed: string[];
  };
}

export const toArray = <T>(x: T | T[]) => (Array.isArray(x) ? x : [x]);

export const unique = <T>(x: T[]) => Array.from(new Set(x));

export const locationOf = (elem, arr, compFn, start = 0, end = arr.length) => {
  if (arr.length === 0) return -1;
  const pivot = (start + end) >> 1;
  const c = compFn(elem, arr[pivot]);
  if (end - start <= 1) return c === -1 ? pivot - 1 : pivot;
  if (c === 0) return pivot;
  return c === 1
    ? locationOf(elem, arr, compFn, pivot, end)
    : locationOf(elem, arr, compFn, start, pivot);
};

export const createEmitter = <T>() => {
  const listeners: ((value: T) => void)[] = [];
  return {
    watch(listener: (value: T) => void) {
      listeners.push(listener);
      return () => listeners.filter(l => l !== listener);
    },
    emit(value: T) {
      listeners.forEach(l => l(value));
    },
  };
};
export const createEmitterMap = <T>() => {
  const listeners: Obj<((value: T) => void)[]> = {};
  return {
    watch(key: string, listener: (value: T) => void) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(listener);
      return () => {
        listeners[key] = listeners[key].filter(l => l !== listener);
        if (listeners[key].length === 0) delete listeners[key];
      };
    },
    emit(key: string, value: T) {
      if (listeners[key]) listeners[key].forEach(l => l(value));
    },
  };
};

export const findForeign = (
  field: ForeignRelationField | RelationField,
  schema: Obj<Obj<Field>>,
) =>
  fieldIs.foreignRelation(field)
    ? field.foreign
    : Object.keys(schema[field.type]).find(f => {
        const foreignField = schema[field.type][f];
        return (
          fieldIs.foreignRelation(foreignField) &&
          foreignField.type === field.type &&
          foreignField.foreign === f
        );
      }) || null;

export const buildArgs = (args: ArgumentNode[], variables: Obj) =>
  keysToObject(
    args,
    ({ value }) => {
      if (value.kind === 'Variable') return variables[value.name.value];
      return (value as IntValueNode | StringValueNode).value;
    },
    ({ name }) => name.value,
  );

export const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (typeof a === 'string') return a.localeCompare(b) as 0 | 1 | -1;
  if (a < b) return -1;
  return 1;
};

export const runFilter = (filter: any, record: any): boolean => {
  const key = Object.keys(filter)[0];

  if (key === '$and')
    return (filter[key] as any[]).every(b => runFilter(b, record));
  if (key === '$or')
    return (filter[key] as any[]).some(b => runFilter(b, record));

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
