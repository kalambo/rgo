import * as deepEqual from 'deep-equal';

import { Args, IdRecord, Obj } from './typings';

export const localPrefix = 'LOCAL__RECORD__';

export const noUndef = (v: any, replacer: any = null) =>
  v === undefined ? replacer : v;

export const undefOr = (v: any, replacer: any = null) =>
  v === undefined ? undefined : replacer;

export const get = (obj: any, key: string[]) =>
  key.reduce((res, k) => res && res[k], obj);

export const buildObject = (values: { key: string[]; value: any }[]) =>
  values.reduce((res, { key, value }) => {
    key.reduce((r, k, i) => {
      if (i === key.length - 1) r[k] = value;
      else r[k] = r[k] || {};
      return r[k];
    }, res);
    return res;
  }, {});

export const keysToObject = <T, U = any>(
  keys: U[],
  valueMap: T | ((k: U, i: number) => T | undefined),
  keyMap?: (k: U, i: number) => string,
) => {
  const valueFunc = typeof valueMap === 'function';
  return keys.reduce<Obj<T>>((res, k, i) => {
    const newValue = valueFunc
      ? (valueMap as ((k: U, i: number) => T | undefined))(k, i)
      : (valueMap as T);
    return newValue === undefined
      ? res
      : { ...res, [keyMap ? keyMap(k, i) : `${k}`]: newValue };
  }, {});
};

const binarySearch = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => 0 | 1 | -1,
  start = 0,
  end = array.length,
): number => {
  if (array.length === 0) return -1;

  const pivot = (start + end) >> 1;
  const c = compareFunc(element, array[pivot]);

  if (end - start <= 1) return c === 1 ? pivot : pivot - 1;
  if (c === 0) return pivot - 1;
  return c === 1
    ? binarySearch(element, array, compareFunc, pivot, end)
    : binarySearch(element, array, compareFunc, start, pivot);
};
export const locationOf = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => 0 | 1 | -1,
) => binarySearch(element, array, compareFunc) + 1;

export const promisifyEmitter = <T>(
  emitter: (listener: (value: T | null) => void) => () => void,
  listener?: (value: T | null) => void,
) => {
  if (listener) return emitter(listener);
  return new Promise<T>(resolve => {
    const unlisten = emitter(value => {
      if (value !== null) {
        if (unlisten) unlisten();
        else setTimeout(() => unlisten());
        resolve(value);
      }
    });
  });
};

const compareValues = (a, b) => {
  if (deepEqual(a, b)) return 0;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase().localeCompare(b.toLowerCase()) as 0 | 1 | -1;
  }
  if (a < b) return -1;
  return 1;
};
export const createCompare = <T>(
  get: (value: T, key: string) => any,
  sort: string[] = [],
) => (value1: T, value2: T): 0 | 1 | -1 => {
  for (const s of sort) {
    const key = s.replace('-', '');
    const dir = s[0] === '-' ? 'desc' : 'asc';
    const v1 = noUndef(get(value1, key));
    const v2 = noUndef(get(value2, key));
    if (v1 === null && v2 !== null) return 1;
    if (v1 !== null && v2 === null) return -1;
    const comp = compareValues(v1, v2);
    if (comp) return dir === 'asc' ? comp : (-comp as 1 | -1);
  }
  return 0;
};

export const runFilter = (
  filter: any[] | undefined,
  id: string,
  record: any,
): boolean => {
  if (!record) return false;
  if (!filter) return true;

  if (['AND', 'OR'].includes(filter[0])) {
    if (filter[0] === 'AND') {
      return filter.slice(1).every(b => runFilter(b, id, record));
    } else if (filter[0] === 'OR') {
      return filter.slice(1).some(b => runFilter(b, id, record));
    }
  }

  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];

  const v = filter[0] === 'id' ? id : noUndef(record[filter[0]]);
  if (op === '=') return deepEqual(v, value);
  if (op === '!=') return !deepEqual(v, value);
  if (op === '<') return v < value;
  if (op === '<=') return v <= value;
  if (op === '>') return v > value;
  if (op === '>=') return v >= value;
  if (op === 'in') {
    return Array.isArray(v)
      ? v.some(x => value.includes(x))
      : value.includes(v);
  }

  return false;
};

export const find = (
  data: IdRecord[],
  { filter, sort, start = 0, end }: Args,
  fields: string[],
) => {
  if (start === end) return [];
  const filterFunc = (record: Obj) => runFilter(filter, record.id, record);
  const compareFunc = createCompare((record: Obj, key) => record[key], sort);
  return data
    .filter(filterFunc)
    .sort(compareFunc)
    .slice(start, end)
    .map(record => keysToObject(fields, f => noUndef(record[f])) as IdRecord);
};

export const getFilterFields = (filter: any[]): string[] => {
  if (['AND', 'OR'].includes(filter[0])) {
    return filter
      .slice(1)
      .reduce((res, f) => [...res, ...getFilterFields(f)], []);
  }
  return [filter[0]];
};
