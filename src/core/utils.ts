import * as stringify from 'stringify-object';

import { FullArgs, Obj } from './typings';

export const noUndef = (v: any, replacer: any = null) =>
  v === undefined ? replacer : v;

export const undefOr = (v: any, replacer: any = null) =>
  v === undefined ? undefined : replacer;

export const isObject = v =>
  Object.prototype.toString.call(v) === '[object Object]';

export const mapArray = (v: any, map: (x: any) => any) =>
  Array.isArray(v) ? v.map(map) : map(v);

export const keysToObject = <T, U = any>(
  keys: U[],
  valueMap: T | ((k: U, i: number) => T | undefined),
  keyMap?: (k: U, i: number) => string,
) => {
  const valueFunc = typeof valueMap === 'function';
  return keys.reduce<Obj<T>>((res, k, i) => {
    const newValue = valueFunc
      ? (valueMap as ((k: U, i: number) => T | undefined))(k, i)
      : valueMap as T;
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
  if (a === b) return 0;
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
    if (comp) return dir === 'asc' ? comp : -comp as 1 | -1;
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

  if (['and', 'or'].includes(filter[0].toLowerCase())) {
    if (filter[0].toLowerCase() === 'and') {
      return filter.slice(1).every(b => runFilter(b, id, record));
    } else if (filter[0].toLowerCase() === 'or') {
      return filter.slice(1).some(b => runFilter(b, id, record));
    }
  }

  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];

  const v = filter[0] === 'id' ? id : noUndef(record[filter[0]]);
  if (op === '=') return v === value;
  if (op === '!=') return v !== value;
  if (op === '<') return v < value;
  if (op === '<=') return v <= value;
  if (op === '>') return v > value;
  if (op === '>=') return v >= value;
  if (op === 'in') return value.includes(v);

  return false;
};

export const printArgs = (args: FullArgs<string>) =>
  `(${stringify(args, {
    singleQuotes: false,
    filter: (obj, prop) => obj[prop] !== undefined,
    inlineCharacterLimit: 1000,
  }).slice(1, -1)})`;
