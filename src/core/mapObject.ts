import set from 'lodash/fp/set';
import { Obj } from 'mishmash';

import { Field, isScalar, ScalarName } from './typings';
import { isObject, keysToObject } from './utils';

const flatSet = (obj: any, key: string, value: any, flat?: boolean) => (
  flat ? ({ ...obj, [key]: value }) : set(key, value, obj)
);

interface MapConfig {
  newKeys?: { [key: string]: string };
  flat?: boolean;
  fields?: Obj<Field>;
  typeMaps?: { [T in ScalarName]?: (value: any) => any };
}

const mapValue = (value: any, typeMap?: (value: any) => any) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(v => mapValue(v, typeMap));
  return (typeMap || (v => v))(value);
}
export default function mapObject(obj: any, config: MapConfig, currentField?: Field) {

  if (!obj) return obj;

  if (currentField) {
    if (isObject(obj) && Object.keys(obj).some(k => k[0] === '$')) {
      return keysToObject(Object.keys(obj), key => mapObject(obj[key], config, currentField));
    }
    const typeMap =  (config.typeMaps || {})[isScalar(currentField) ? currentField.scalar : ''];
    return mapValue(obj, typeMap);
  }

  if (Array.isArray(obj)) return obj.map(o => mapObject(o, config));
  if (isObject(obj)) {
    return Object.keys(obj).reduce((res, key) => flatSet(res,
      (config.newKeys || {})[key] || key,
      mapObject(obj[key], config, (config.fields || {})[key]),
      config.flat,
    ), {});
  }

  return obj;

}
