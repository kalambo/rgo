import { FieldPath, NestedFields } from './typings';

export const flatten = <T = any>(arrays: T[][]) =>
  arrays.reduce((res, a) => res.concat(a), []);

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

export const getNestedFields = (fields: FieldPath[]): NestedFields =>
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
