import get from 'lodash/fp/get';
import set from 'lodash/fp/set';

import { DataKey } from './typings';

export const undefToNull = (v: any) => v === undefined ? null : v;

export const isObject = (v) => (
  Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype
);

export const keysToObject = <T, U>(
  keys: T[],
  valueMap: (k: T, i: number) => U | undefined,
  keyMap?: (k: T, i: number) => string,
) => (
  keys.reduce(
    (res, k, i) => {
      const newValue = valueMap(k, i);
      return newValue === undefined ? res : { ...res, [keyMap ? keyMap(k, i) : `${k}`]: newValue };
    },
    {} as { [k: string]: U },
  )
);

export const dataGet = (data: any, key: DataKey) => (
  get([key.type, key.id, key.field], data)
);
export const dataSet = (data: any, key: DataKey, value: any) => (
  set([key.type, key.id, key.field], value, data)
);
