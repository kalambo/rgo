import { Collection } from 'mongodb';
import * as flatten from 'flat';
import * as set from 'lodash/fp/set';

import { keysToObject, mapArray, Obj, undefOr } from '../../core';

import { Connector } from '../typings';

const isObject = v =>
  Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype;

const flatSet = (obj: any, key: string, value: any, flat?: boolean) =>
  flat ? { ...obj, [key]: value } : set(key, value, obj);

const mapObject = (
  obj: any,
  config: {
    valueMaps?: Obj<((value: any) => any) | true>;
    newKeys?: Obj<string>;
    flat?: boolean;
    continue?: (value: any) => boolean;
  },
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

export default function mongoConnector(
  collection: Collection,
  newId: () => string,
  fieldDbKeys: Obj<string>,
  fieldMaps: Obj<{
    toDb(value: any): any;
    fromDb(value: any): any;
  } | null>,
): Connector {
  const toDbMaps = {
    base: keysToObject<((value: any) => any) | true>(
      Object.keys(fieldMaps),
      k => (fieldMaps[k] && fieldMaps[k]!.toDb) || true,
    ),
    ignoreValues: keysToObject<true>(Object.keys(fieldMaps), () => true),
  };
  const toDb = (
    obj,
    config: { flat?: boolean; ignoreValues?: boolean } = {},
  ) => {
    return mapObject(obj, {
      valueMaps: config.ignoreValues ? toDbMaps.ignoreValues : toDbMaps.base,
      newKeys: fieldDbKeys,
      flat: config.flat,
      continue: v => isObject(v) && Object.keys(v).some(k => k[0] === '$'),
    });
  };

  const reverseFieldDbKeys = keysToObject(
    Object.keys(fieldDbKeys),
    k => k,
    k => fieldDbKeys[k],
  );
  const fromDb = (doc: any) => {
    if (!doc) return doc;
    const flat = flatten(doc, { safe: true });
    return keysToObject(
      Object.keys(flat).map(k => ({
        k: reverseFieldDbKeys[k] || k,
        dbKey: k,
      })),
      ({ k, dbKey }) =>
        fieldMaps[k]
          ? mapArray(flat[dbKey], fieldMaps[k]!.fromDb)
          : flat[dbKey],
      ({ k }) => k,
    );
  };

  const ops = {
    '=': '$eq',
    '!=': '$ne',
    '<': '$lt',
    '<=': '$lte',
    '>': '$gt',
    '>=': '$gte',
    in: '$in',
  };
  const mongoFilter = (filter: any[]) => {
    if (Array.isArray(filter[1] || [])) {
      return {
        [filter[0].toLowerCase() === 'and' ? '$and' : '$or']: filter
          .slice(1)
          .map(mongoFilter),
      };
    }
    return {
      [fieldDbKeys[filter[0]] || filter[0]]: { [ops[filter[1]]]: filter[2] },
    };
  };

  return {
    newId,
    async query({ filter, sort, start = 0, end, fields }) {
      if (start === end) return [];
      const result = collection.find(
        filter && toDb(mongoFilter(filter), { flat: true }),
        toDb(keysToObject(fields || [], () => true), {
          flat: true,
          ignoreValues: true,
        }),
        start,
        undefOr(end, end! - start),
      );
      if (sort) {
        result.sort(
          toDb(
            sort.map(s => {
              const field = s.replace('-', '');
              return [
                fieldDbKeys[field] || field,
                s[0] === '-' ? 'desc' : 'asc',
              ];
            }),
            {
              flat: true,
              ignoreValues: true,
            },
          ),
        );
      }
      return (await result.toArray()).map(fromDb);
    },
    async findById(id) {
      return fromDb(await collection.findOne({ [fieldDbKeys.id || 'id']: id }));
    },
    async insert(id, data) {
      const obj = { id, ...data };
      await collection.insert(toDb(obj));
    },
    async update(id, data) {
      const filter = toDb({ id }, { flat: true });
      await collection.update(filter, { $set: toDb(data, { flat: true }) });
    },
    async delete(id) {
      const filter = toDb({ id }, { flat: true });
      await collection.deleteOne(filter);
    },
    async dump() {
      return (await collection.find().toArray()).map(fromDb);
    },
    async restore(data) {
      try {
        await collection.drop();
      } catch (error) {}
      if (data.length > 0) {
        await collection.insertMany(data.map(toDb as any));
      }
    },
  };
}
