import * as deepEqual from 'deep-equal';
import keysToObject from 'keys-to-object';

import { Args, Data, Enhancer, FilterOp, Obj } from './typings';

export const newIdPrefix = 'NEW__RECORD__';
export const isNewId = (id: string) => id.startsWith(newIdPrefix);

export const isEqual = (v1: any, v2: any) =>
  deepEqual(v1, v2, { strict: true });

export const mapArray = (v: any, map: (x: any) => any) =>
  Array.isArray(v) ? v.map(map) : map(v);

export const noUndef = (v: any, replacer: any = null) =>
  v === undefined ? replacer : v;

export const undefOr = (v: any, replacer: any = null) =>
  v === undefined ? undefined : replacer;

export const get = (obj: any, key: string[]) =>
  key.reduce((res, k) => res && res[k], obj);

const isObject = (v: any) =>
  Object.prototype.toString.call(v) === '[object Object]';
const clone = v => (isObject(v) ? mergeTwo({}, v) : v);
const mergeTwo = (target: any, source: Obj) => {
  const result = {};
  if (isObject(target)) {
    Object.keys(target).forEach(k => (result[k] = clone(target[k])));
  }
  Object.keys(source).forEach(k => {
    if (!isObject(source[k]) || !target[k]) result[k] = clone(source[k]);
    else result[k] = mergeTwo(target[k], source[k]);
  });
  return result;
};
export const merge = (...args: Obj[]) =>
  args.reduce((res, obj) => mergeTwo(res, obj), {});

export const mapData = <T1, T2 = T1>(
  data: Data<T1>,
  map: (value: T1, type: string, id: string) => T2,
) =>
  keysToObject(Object.keys(data), type =>
    keysToObject(Object.keys(data[type]), id => map(data[type][id], type, id)),
  ) as Data<T2>;

export const mapDataAsync = async <T1, T2 = T1>(
  data: Data<T1>,
  map: (value: T1, type: string, id: string) => Promise<T2>,
) => {
  const types = Object.keys(data);
  return keysToObject(
    await Promise.all(
      types.map(async type => {
        const ids = Object.keys(data[type]);
        return keysToObject(
          await Promise.all(ids.map(id => map(data[type][id], type, id))),
          v => v,
          (_, i) => ids[i],
        );
      }),
    ),
    v => v,
    (_, i) => types[i],
  );
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
  if (isEqual(a, b)) return 0;
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

export const runFilterValue = (value: any, op: FilterOp, filterValue: any) => {
  if (op === '=') return isEqual(value, filterValue);
  if (op === '!=') return !isEqual(value, filterValue);
  if (op === '<') return value < filterValue;
  if (op === '<=') return value <= filterValue;
  if (op === '>') return value > filterValue;
  if (op === '>=') return value >= filterValue;
  return Array.isArray(value)
    ? value.some(x => filterValue.includes(x))
    : filterValue.includes(value);
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
  return runFilterValue(
    filter[0] === 'id' ? id : noUndef(record[filter[0]]),
    filter.length === 3 ? filter[1] : '=',
    filter[filter.length - 1],
  );
};

export const find = (
  data: Obj[],
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
    .map(record => keysToObject(fields, f => noUndef(record[f])));
};

export const getFilterFields = (filter: any[]): string[] => {
  if (['AND', 'OR'].includes(filter[0])) {
    return filter
      .slice(1)
      .reduce((res, f) => [...res, ...getFilterFields(f)], []);
  }
  return [filter[0]];
};

export const compose = (...enhancers: Enhancer[]): Enhancer => {
  if (enhancers.length === 0) return arg => arg;
  if (enhancers.length === 1) return enhancers[0];
  return enhancers.reduce((a, b) => request => a(b(request)));
};
