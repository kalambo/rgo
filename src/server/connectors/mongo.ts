import { Collection } from 'mongodb';
import * as flatten from 'flat';

import { keysToObject, mapArray, mapObject, Obj, undefOr } from '../../core';

import { Connector, FieldDbMap } from '../typings';

const isObject = v =>
  Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype;

export default function mongoConnector(
  collection: Collection,
  newId: () => string,
  fieldDbKeys: Obj<string>,
  fieldMaps: Obj<FieldDbMap | null>,
): Connector {
  const toDbMaps = {
    base: keysToObject(
      Object.keys(fieldMaps),
      k => (fieldMaps[k] && fieldMaps[k]!.toDb) || true,
    ),
    ignoreValues: keysToObject<string, true>(
      Object.keys(fieldMaps),
      () => true,
    ),
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
    if (filter[0] === 'AND' || filter[0] === 'OR') {
      return {
        [filter[0] === 'AND' ? '$and' : '$or']: filter[1].map(mongoFilter),
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
            sort.map(([field, order]) => [fieldDbKeys[field] || field, order]),
            { flat: true, ignoreValues: true },
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
