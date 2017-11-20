import keysToObject from 'keys-to-object';

import {
  Args,
  Data,
  fieldIs,
  Obj,
  Record,
  RecordValue,
  Resolver,
  ResolveRequest,
  Schema,
} from '../typings';
import {
  createCompare,
  isEqual,
  isNewId,
  mapArray,
  mapDataAsync,
  noUndef,
  undefOr,
} from '../utils';
import walker from '../walker';

export interface IdRecord {
  id: string;
  [field: string]: RecordValue | null;
}

export interface Db {
  find(
    type: string,
    args: Args,
    fields: string[],
  ): IdRecord[] | Promise<IdRecord[]>;
  insert(type: string, record: Record): string | Promise<string>;
  update(type: string, id: string, record: Record): void | Promise<void>;
  delete: (type: string, id: string) => void | Promise<void>;
}

const runner = walker<
  Promise<void>,
  { db: Db; data: Data<Record>; firstIds: Data<string | null> }
>(
  async (
    {
      root,
      field,
      args: queryArgs,
      fields,
      extra = { start: 0, end: 0 },
      trace,
      path,
      key,
    },
    relations,
    { db, data, firstIds },
    rootRecords: IdRecord[],
    records: Obj<Obj<Obj<Record>>>,
    querying: boolean,
  ) => {
    const args = { ...queryArgs };
    if (!root.type || fieldIs.foreignRelation(field)) {
      args.sort = args.sort || [];
    }
    const slice = {
      start: (args.start || 0) - extra.start,
      end: undefOr(args.end, args.end! + extra.end) as number | undefined,
    };
    const relationFields = relations.filter(r => !r.foreign).map(r => r.name);
    if (querying) {
      const allFields = Array.from(
        new Set(['id', ...fields, ...relationFields]),
      );
      if (root.type) {
        const rootField = fieldIs.relation(field) ? root.field : 'id';
        const relField = fieldIs.relation(field) ? 'id' : field.foreign;
        const relFilter = [
          relField,
          'in',
          rootRecords.reduce(
            (res, root) => res.concat((root[rootField] as string[]) || []),
            [] as string[],
          ),
        ];
        args.filter = args.filter ? ['AND', args.filter, relFilter] : relFilter;
      }
      const queryRecords = await db.find(
        field.type,
        {
          ...args,
          start: 0,
          end: undefOr(
            slice.end,
            (slice.start || 0) + slice.end! * rootRecords.length,
          ),
        },
        allFields,
      );
      records[key] = records[key] || {};
      const setRecords = (
        rootId: string,
        filter: ((record: IdRecord) => boolean) | boolean,
      ) => {
        records[key][rootId] = records[key][rootId] || {};
        queryRecords.forEach(idRecord => {
          if (typeof filter === 'function' ? filter(idRecord) : filter) {
            const { id, ...record } = idRecord;
            records[key][rootId][id] = records[key][rootId][id]
              ? { ...records[key][rootId][id], ...record }
              : record;
          }
        });
      };
      if (!root.type) {
        setRecords('', true);
      } else {
        rootRecords.forEach(rootRecord => {
          if (fieldIs.relation(field)) {
            if (!rootRecord[root.field]) {
              setRecords(rootRecord.id, false);
            } else if (field.isList) {
              setRecords(rootRecord.id, r =>
                (rootRecord[root.field] as (string | null)[]).includes(r.id),
              );
            } else {
              setRecords(
                rootRecord.id,
                r => r.id === (rootRecord[root.field] as string),
              );
            }
          } else {
            setRecords(rootRecord.id, r => {
              const value = r[field.foreign] as string[] | string | null;
              return Array.isArray(value)
                ? value.includes(rootRecord.id)
                : value === rootRecord.id;
            });
          }
        });
      }
      const newRecords = {};
      await Promise.all(
        relations.map(r => r.walk(queryRecords, newRecords, true)),
      );
      await Promise.all(
        relations.map(r => r.walk(queryRecords, newRecords, false)),
      );
    } else {
      data[field.type] = data[field.type] || {};
      const fieldPath = [...path, key].join('_');
      if (!firstIds[fieldPath]) {
        firstIds[fieldPath] = {};
        Object.keys(records[key]).forEach(rootId => {
          const sorted = Object.keys(records[key][rootId]).sort(
            createCompare(
              (id, k) =>
                k === 'id' ? id : noUndef(records[key][rootId][id][k]),
              args.sort,
            ),
          );
          sorted.forEach((id, i) => {
            if (
              i >= slice.start &&
              (slice.end === undefined || i < slice.end)
            ) {
              const record =
                trace &&
                i >= trace.start &&
                (trace.end === undefined || i < trace.end)
                  ? keysToObject(relationFields, f =>
                      noUndef(records[key][rootId][id][f]),
                    )
                  : records[key][rootId][id];
              data[field.type][id] = data[field.type][id]
                ? { ...data[field.type][id], ...record }
                : record;
            }
          });
          if (fieldIs.foreignRelation(field) || (field.isList && args.sort)) {
            firstIds[fieldPath][rootId] = sorted[args.start || 0] || null;
          }
        });
      }
    }
  },
);

const commit = async (commits: Data[] = [], schema: Schema, db: Db) => {
  const result: Data<string>[] = [];
  for (const records of commits) {
    const newIds = keysToObject<Obj<string>>(Object.keys(records), () => ({}));
    const getId = (type: string, id: string) => (newIds[type] || {})[id] || id;
    await mapDataAsync(records, async (record, type, id) => {
      if (!record) await db.delete(type, id);
      else if (isNewId(id)) newIds[type][id] = await db.insert(type, record);
      else await db.update(type, id, record);
    });
    await mapDataAsync(records, async (r, type, id) => {
      if (r) {
        const record = { ...r };
        let hasNewIds = false;
        for (const f of Object.keys(record)) {
          const field = schema[type][f];
          if (fieldIs.relation(field) && newIds[field.type]) {
            const prev = record[f];
            record[f] = mapArray(record[f], id => getId(field.type, id));
            if (!isEqual(record[f], prev)) hasNewIds = true;
          }
        }
        if (hasNewIds) await db.update(type, getId(type, id), record);
      }
    });
    result.push(newIds);
  }
  return result;
};

export default function dbResolver(schema: Schema, db: Db) {
  return (async (request?: ResolveRequest) => {
    if (!request) return schema;
    const newIds = await commit(request.commits, schema, db);
    const records: Obj<Obj<Obj<Record>>> = {};
    const context = { db, data: {}, firstIds: {} };
    await Promise.all(
      runner(request.queries || [], schema, context, [{}], records, true),
    );
    await Promise.all(
      runner(request.queries || [], schema, context, [{}], records, false),
    );
    return { newIds, data: context.data, firstIds: context.firstIds };
  }) as Resolver;
}
