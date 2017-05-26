import { Obj } from 'mishmash';
import * as get from 'lodash/fp/get';
import * as set from 'lodash/fp/set';

import { DataKey } from './typings';

export const undefToNull = (v: any) => v === undefined ? null : v;

export const isObject = (v) => Object.prototype.toString.call(v) === '[object Object]';

export const mapArray = (v: any, map: (x: any) => any) => Array.isArray(v) ? v.map(map) : map(v);

export const dataGet = (data: any, key: DataKey) => (
  get([key.type, key.id, key.field], data)
);
export const dataSet = (data: any, key: DataKey, value: any) => (
  set([key.type, key.id, key.field], value, data)
);

export interface MapConfig {
  valueMaps?: Obj<((value: any) => any) | true>;
  newKeys?: Obj<string>;
  flat?: boolean;
  continue?: (value: any) => boolean;
}

const flatSet = (obj: any, key: string, value: any, flat?: boolean) => (
  flat ? ({ ...obj, [key]: value }) : set(key, value, obj)
);

export const mapObject = (obj: any, config: MapConfig, activeField?: string) => {

  if (activeField && !(config.continue && config.continue(obj))) {
    const map = (config.valueMaps && config.valueMaps[activeField])!;
    return map === true ? obj : map(obj);
  }

  if (!obj) return obj;

  if (Array.isArray(obj)) return obj.map(o => mapObject(o, config));

  if (isObject(obj)) {
    return Object.keys(obj).reduce((res, k) => flatSet(
      res,
      config.newKeys && config.newKeys[k] || k,
      mapObject(
        obj[k], config, activeField || ((config.valueMaps && config.valueMaps[k]) ? k : undefined),
      ),
      config.flat,
    ), {});
  }

}
