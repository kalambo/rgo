import { Collection } from 'mongodb';
import get from 'lodash/fp/get';
import { Obj } from 'mishmash';

import { Field, keysToObject, mapObject, ScalarName } from '../../core';

import { Connector } from '../typings';

interface TypeMap {
  toDb: (value: any) => any;
  fromDb: (value: any) => any;
};

const isObject = (v) => (
  Object.prototype.toString.call(v) === '[object Object]' && !v._bsontype
);
const mongoFilter = (filter: any) => {
  if (Array.isArray(filter)) return filter.map(mongoFilter);
  if (isObject(filter)) {
    return keysToObject(Object.keys(filter), k => {
      if (k === '$or') {
        const k2 = Object.keys(filter[k][0])[0];
        if (filter[k][0][k2].$eq === null) return [...filter[k], { [k2]: { $exists: false } }];
      }
      return mongoFilter(filter[k]);
    });
  }
  return filter;
}

export default function mongoConnector(
  collection: Collection, fields: Obj<Field>, fieldDbKeys: Obj<string>,
  typeMaps: { [T in ScalarName]?: TypeMap },
): Connector {

  const typesToDb = {} as { [T in ScalarName]: (value: any) => any };
  const typesFromDb = {} as { [T in ScalarName]: (value: any) => any };
  for (const k of Object.keys(typeMaps)) {
    typesToDb[k] = typeMaps[k].toDb;
    typesFromDb[k] = typeMaps[k].fromDb;
  }

  const toDb = (obj: any, config: { flat?: boolean, ignoreValues?: boolean } = {}) => {
    return mapObject(obj, {
      newKeys: fieldDbKeys,
      flat: config.flat,
      fields,
      typeMaps: config.ignoreValues ? ({} as any) : typesToDb,
    });
  };
  const fromDb = (doc: any) => {
    if (!doc) return doc;
    const obj = {} as any;
    Object.keys(fields).forEach(k => {
      const v = get(fieldDbKeys[k] || k, doc);
      if (v !== undefined) obj[k] = mapObject(v, { typeMaps: typesFromDb }, fields[k]);
    });
    return obj;
  };

  return {

    async query({ filter = {}, sort = {}, skip = 0, show = null, fields = [] }) {

      if (show === 0) return [];

      const cursor = collection.find(
        toDb(mongoFilter(filter), { flat: true }),
        toDb(keysToObject(fields, () => true), { flat: true, ignoreValues: true }),
      );

      cursor.sort(toDb(sort, { flat: true, ignoreValues: true }));

      if (skip) cursor.skip(skip);
      if (show) cursor.limit(show);

      return (await cursor.toArray()).map(fromDb);

    },

    async findById(id) {
      return fromDb(await collection.findOne(toDb({ id }, { flat: true })));
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
        await collection.insertMany(data.map(toDb));
      }
    },

  };

}
