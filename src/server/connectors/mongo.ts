import { Collection } from 'mongodb';
import * as flatten from 'flat';

import { keysToObject, mapArray, mapObject, Obj } from '../../core';

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
    async query({
      filter = {},
      sort = [],
      skip = 0,
      show = null,
      fields = null,
      trace,
    }) {
      if (show === 0) return [];

      const queryConfig = toDb(mongoFilter(filter), { flat: true });
      const fieldsConfig = toDb(keysToObject(fields || [], () => true), {
        flat: true,
        ignoreValues: true,
      });
      const sortConfig = toDb(
        sort.map(([field, order]) => [fieldDbKeys[field] || field, order]),
        { flat: true, ignoreValues: true },
      );

      if (!trace) {
        return (await collection
          .find(
            queryConfig,
            fieldsConfig,
            skip,
            show === null ? undefined : show,
          )
          .sort(sortConfig)
          .toArray()).map(fromDb);
      }

      // const cursor1 = cursor.clone();
      // cursor1.skip(skip);
      // cursor1.limit(trace.skip);

      // const cursor2 = cursor.clone();
      // cursor2.project({ [fieldDbKeys.id || 'id']: true });
      // cursor2.skip(trace.skip);
      // if (trace.show !== null) cursor2.limit(trace.show);

      // const cursor3 = cursor.clone();
      // if (trace.show !== null) cursor3.skip(trace.show);
      // if (show !== null) cursor3.limit(show);

      const results = Promise.all([
        skip === trace.skip
          ? []
          : (await collection
              .find(queryConfig, fieldsConfig, skip, trace.skip)
              .sort(sortConfig)
              .toArray()).map(fromDb),
        (await collection
          .find(
            queryConfig,
            { [fieldDbKeys.id || 'id']: true },
            trace.skip,
            trace.show === null ? undefined : trace.show,
          )
          .sort(sortConfig)
          .toArray()).map(fromDb),
        trace.show === null || show === trace.show
          ? []
          : (await collection
              .find(
                queryConfig,
                fieldsConfig,
                trace.show,
                show === null ? undefined : show,
              )
              .sort(sortConfig)
              .toArray()).map(fromDb),
      ]);

      return [...results[0], ...results[1], ...results[2]];
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
