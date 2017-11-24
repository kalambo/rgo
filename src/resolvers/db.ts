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
  getId,
  isEqual,
  isNewId,
  mapArray,
  mapDataAsync,
  mergeRecord,
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
      args,
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
    const slice = {
      start: (args.start || 0) - extra.start,
      end: undefOr(args.end, args.end! + extra.end) as number | undefined,
    };
    const relationFields = relations.filter(r => !r.foreign).map(r => r.name);
    const allFields = Array.from(new Set(['id', ...fields, ...relationFields]));
    if (querying) {
      const dbQuery = {
        ...args,
        start: 0,
        end: undefOr(
          slice.end,
          (slice.start || 0) + slice.end! * rootRecords.length,
        ),
      };
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
        dbQuery.filter = dbQuery.filter
          ? ['AND', dbQuery.filter, relFilter]
          : relFilter;
      }
      const queryRecords = await db.find(field.type, dbQuery, allFields);
      records[key] = records[key] || {};
      const setRecords = (
        rootId: string,
        filter?: (record: IdRecord) => boolean,
      ) => {
        records[key][rootId] = records[key][rootId] || {};
        queryRecords.forEach(idRecord => {
          if (!filter || filter(idRecord)) {
            const { id, ...record } = idRecord;
            mergeRecord(records[key][rootId], id, record);
          }
        });
      };
      if (!root.type) {
        setRecords('');
      } else {
        rootRecords.forEach(rootRecord => {
          if (fieldIs.foreignRelation(field)) {
            setRecords(rootRecord.id, r => {
              const value = r[field.foreign] as string[] | string | null;
              return Array.isArray(value)
                ? value.includes(rootRecord.id)
                : value === rootRecord.id;
            });
          } else if (rootRecord[root.field]) {
            if (field.isList) {
              setRecords(rootRecord.id, r =>
                (rootRecord[root.field] as (string | null)[]).includes(r.id),
              );
            } else {
              setRecords(
                rootRecord.id,
                r => r.id === (rootRecord[root.field] as string),
              );
            }
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
              const record = keysToObject(
                trace &&
                i >= trace.start &&
                (trace.end === undefined || i < trace.end)
                  ? relationFields
                  : allFields,
                f => noUndef(records[key][rootId][id][f]),
              );
              delete record.id;
              mergeRecord(data[field.type], id, record);
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

const commit = async (
  commits: Data[] = [],
  schema: Schema,
  db: Db,
  newIds: Data<string>,
) => {
  for (const records of commits) {
    await mapDataAsync(records, async (record, type, id) => {
      newIds[type] = newIds[type] || {};
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
            record[f] = mapArray(record[f], id =>
              getId(id, newIds[field.type]),
            );
            if (!isEqual(record[f], prev)) hasNewIds = true;
          }
        }
        if (hasNewIds) await db.update(type, getId(id, newIds[type])!, record);
      }
    });
  }
};

export default function dbResolver(schema: Schema, db: Db) {
  return (async (request?: ResolveRequest) => {
    if (!request) return schema;
    const newIds: Data<string> = {};
    await commit(request.commits, schema, db, newIds);
    const records: Obj<Obj<Obj<Record>>> = {};
    const context = { db, data: {}, firstIds: {} };
    await Promise.all(
      runner(request.queries || [], schema, context, [{}], records, true),
    );
    await Promise.all(
      runner(request.queries || [], schema, context, [{}], records, false),
    );
    return {
      data: context.data,
      newIds,
      errors: [],
      firstIds: context.firstIds,
    };
  }) as Resolver;
}
