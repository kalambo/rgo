import { Collection } from 'mongodb';
import * as flatten from 'flat';

import { keysToObject, mapArray, mapObject, Obj, undefOr } from '../../core';

import { Connector, FieldDbMap } from '../typings';

const isObject = v =>
  Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype;
const mongoFilter = (filter: any) => {
  if (Array.isArray(filter)) return filter.map(mongoFilter);
  if (isObject(filter)) {
    return keysToObject(Object.keys(filter), k => {
      if (k === '$or') {
        const k2 = Object.keys(filter[k][0])[0];
        if (filter[k][0][k2].$eq === null)
          return [...filter[k], { [k2]: { $exists: false } }];
      }
      return mongoFilter(filter[k]);
    });
  }
  return filter;
};

export default function mongoConnector(
  collection: Collection,
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
      Object.keys(flat).map(k => ({ k: reverseFieldDbKeys[k] || k, dbKey: k })),
      ({ k, dbKey }) =>
        fieldMaps[k]
          ? mapArray(flat[dbKey], fieldMaps[k]!.fromDb)
          : flat[dbKey],
      ({ k }) => k,
    );
  };

  return {
    async query({ filter = {}, sort = [], start = 0, end, fields }) {
      if (start === end) return [];

      return (await collection
        .find(
          toDb(mongoFilter(filter), { flat: true }),
          toDb(keysToObject(fields || [], () => true), {
            flat: true,
            ignoreValues: true,
          }),
          start,
          undefOr(end, end! - start),
        )
        .sort(
          toDb(
            sort.map(([field, order]) => [fieldDbKeys[field] || field, order]),
            { flat: true, ignoreValues: true },
          ),
        )
        .toArray()).map(fromDb);
    },

    async findById(id) {
      return fromDb(await collection.findOne({ [fieldDbKeys.id || 'id']: id }));
    },
    async findByIds(ids) {
      return fromDb(
        await collection.find({ [fieldDbKeys.id || 'id']: { $in: ids } }),
      );
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
