import * as set from 'lodash/fp/set';

import { Obj } from './typings';

export const noUndef = (v: any, replacer: any = null) =>
  v === undefined ? replacer : v;

export const isObject = v =>
  Object.prototype.toString.call(v) === '[object Object]';

export const mapArray = (v: any, map: (x: any) => any) =>
  Array.isArray(v) ? v.map(map) : map(v);

export interface MapConfig {
  valueMaps?: Obj<((value: any) => any) | true>;
  newKeys?: Obj<string>;
  flat?: boolean;
  continue?: (value: any) => boolean;
}

const flatSet = (obj: any, key: string, value: any, flat?: boolean) =>
  flat ? { ...obj, [key]: value } : set(key, value, obj);

export const keysToObject = <T, U>(
  keys: T[],
  valueMap: (k: T, i: number) => U | undefined,
  keyMap?: (k: T, i: number) => string,
) =>
  keys.reduce((res, k, i) => {
    const newValue = valueMap(k, i);
    return newValue === undefined
      ? res
      : { ...res, [keyMap ? keyMap(k, i) : `${k}`]: newValue };
  }, {} as Obj<U>);

export const mapObject = (
  obj: any,
  config: MapConfig,
  activeField?: string,
) => {
  if (activeField && !(config.continue && config.continue(obj))) {
    const map = (config.valueMaps && config.valueMaps[activeField])!;
    return map === true ? obj : map(obj);
  }

  if (!obj) return obj;

  if (Array.isArray(obj)) return obj.map(o => mapObject(o, config));

  if (isObject(obj)) {
    return Object.keys(obj).reduce(
      (res, k) =>
        flatSet(
          res,
          (config.newKeys && config.newKeys[k]) || k,
          mapObject(
            obj[k],
            config,
            activeField ||
              (config.valueMaps && config.valueMaps[k] ? k : undefined),
          ),
          config.flat,
        ),
      {},
    );
  }
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

const compareValues = (a, b) => {
  if (a === b) return 0;
  if (typeof a === 'string') return a.localeCompare(b) as 0 | 1 | -1;
  if (a < b) return -1;
  return 1;
};
export const createCompare = <T>(
  get: (value: T, key: string) => any,
  sort: [string, 'asc' | 'desc'][],
) => (value1: T, value2: T): 0 | 1 | -1 => {
  for (const [key, order] of sort) {
    const v1 = get(value1, key);
    const v2 = get(value2, key);
    const v1Null = v1 === null || v1 === undefined;
    const v2Null = v2 === null || v2 === undefined;
    if (v1Null && !v2Null) return 1;
    if (v2Null && !v1Null) return -1;
    const comp = compareValues(get(value1, key), get(value2, key));
    if (comp) return order === 'asc' ? comp : -comp as 1 | -1;
  }
  return 0;
};

export const runFilter = (filter: any, id: string, record: any): boolean => {
  if (!record) return false;

  const key = Object.keys(filter)[0];
  if (!key) return true;

  if (key === '$and')
    return (filter[key] as any[]).every(b => runFilter(b, id, record));
  if (key === '$or')
    return (filter[key] as any[]).some(b => runFilter(b, id, record));

  const op = Object.keys(filter[key])[0];
  const value = key === 'id' ? id : record[key];
  if (op === '$eq') return value === filter[key][op];
  if (op === '$ne') return value !== filter[key][op];
  if (op === '$lt') return value < filter[key][op];
  if (op === '$lte') return value <= filter[key][op];
  if (op === '$gt') return value > filter[key][op];
  if (op === '$gte') return value >= filter[key][op];
  if (op === '$in') return filter[key][op].includes(value);

  return false;
};
