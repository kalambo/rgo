import { Obj } from 'mishmash';
import * as set from 'lodash/fp/set';

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

export const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (typeof a === 'string') return a.localeCompare(b) as 0 | 1 | -1;
  if (a < b) return -1;
  return 1;
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
