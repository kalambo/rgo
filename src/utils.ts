import { diffArrays } from 'diff';
import keysToObject from 'keys-to-object';

import { ArrayChange, FieldPath, NestedFields, Obj, Value } from './typings';

export const flatten = <T = any>(arrays: T[][]) =>
  arrays.reduce((res, a) => res.concat(a), []);

export const isObject = (obj: any) =>
  Object.prototype.toString.call(obj) === '[object Object]';

const hashPart = (obj: any): string => {
  if (Array.isArray(obj)) {
    return `[${obj.map(v => `${hashPart(v)}`).join(',')}]`;
  }
  if (Object.prototype.toString.call(obj) === '[object Object]') {
    return `{${Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .map(k => `"${k}":${hashPart(obj[k])}`)
      .sort()
      .join(',')}}`;
  }
  if (typeof obj === 'string') return `"${obj}"`;
  return `${obj}`;
};
const hashCache = new WeakMap();
export const hash = (obj: any): string => {
  if (typeof obj === 'object') {
    if (hashCache.has(obj)) return hashCache.get(obj);
    const result = hashPart(obj);
    hashCache.set(obj, result);
    return result;
  }
  return hashPart(obj);
};

export const unique = <T>(items1: T[]) => Array.from(new Set(items1));

export const uniqueKeys = (obj1: Obj, obj2: Obj) =>
  unique([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

export const merge = (obj1: any, obj2: any) => {
  if (isObject(obj1) && isObject(obj2)) {
    return keysToObject(uniqueKeys(obj1, obj2), k => merge(obj1[k], obj2[k]));
  }
  return obj2 === undefined ? obj1 : obj2;
};

const binarySearch = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => number,
  start = 0,
  end = array.length,
): number => {
  if (array.length === 0) return -1;

  const pivot = (start + end) >> 1;
  const c = compareFunc(element, array[pivot]);

  if (end - start <= 1) return c > 0 ? pivot : pivot - 1;
  if (c === 0) return pivot - 1;
  return c > 0
    ? binarySearch(element, array, compareFunc, pivot, end)
    : binarySearch(element, array, compareFunc, start, pivot);
};
export const locationOf = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => number,
) => binarySearch(element, array, compareFunc) + 1;

export const arrayDiff = <T = any>(
  items: T[] | null,
  newItems: T[],
  map?: (v: T, isNew: boolean) => any,
): { changes: ArrayChange<T>[]; unchanged: ArrayChange<T>[] } => {
  if (!items) {
    return {
      changes: [],
      unchanged: newItems.map((item, i) => ({
        index: i,
        value: map ? map(item, false) : item,
      })),
    };
  }
  const d = diffArrays(items, newItems);
  const changes: ArrayChange<T>[] = [];
  const unchanged: ArrayChange<T>[] = [];
  let index = 0;
  let i = 0;
  while (i < d.length) {
    if (d[i].added || d[i].removed) {
      const d2 = d[i + 1] || {};
      const added = d[i].added ? d[i].value : d2.added ? d2.value : null;
      const removed = d[i].removed ? d[i].count : d2.removed ? d2.count : null;
      changes.push({
        index,
        ...(added
          ? {
              added: map
                ? added.map(v => map(v, true)).filter(v => v !== false)
                : added,
            }
          : {}),
        ...(removed ? { removed } : {}),
      });
      if (added) index += added.length;
      if (removed) index += removed;
      if (d2.added || d2.removed) i++;
    } else {
      for (let j = 0; j < d[i].count!; j++) {
        const v = newItems[index + j];
        unchanged.push({
          index: index + j,
          value: map ? map(v, false).filter(v => v !== false) : v,
        });
      }
    }
    index += d[i].count!;
    i++;
  }
  return { changes, unchanged };
};

export const minValue = (...values: (Value | null | undefined)[]) =>
  values.reduce((v1, v2) => {
    if (v1 === undefined || v2 === undefined) return v1 === undefined ? v2 : v1;
    if (v1 === null || v2 === null) return v1 === null ? v2 : v1;
    return v1 < v2 ? v1 : v2;
  });

export const maxValue = (...values: (Value | null | undefined)[]) =>
  values.reduce((v1, v2) => {
    if (v1 === undefined || v2 === undefined) return v1 === undefined ? v2 : v1;
    if (v1 === null || v2 === null) return v1 === null ? v2 : v1;
    return v1 > v2 ? v1 : v2;
  });

export const nestedFields = (fields: FieldPath[]): NestedFields =>
  fields.reduce(
    (result, field) => {
      field.reduce((res, f, i) => {
        if (i === field.length - 1) res[f] = null;
        else res[f] = res[f] || {};
        return res[f] as NestedFields;
      }, result);
      return result;
    },
    {} as NestedFields,
  );
