import keysToObject from 'keys-to-object';

import {
  Args,
  Field,
  fieldIs,
  Obj,
  Record,
  RecordValue,
  Resolver,
  ResolveRequest,
} from '../typings';
import { isEqual, isNewId, mapArray, undefOr } from '../utils';
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
  {
    db: Db;
    data: Obj<Obj<Record>>;
    firstIds: Obj<Obj<string | null>>;
    records: Obj<IdRecord[]>;
  }
>(
  async (
    { root, field, args, fields, extra = { start: 0, end: 0 }, path, key },
    relations,
    { db, data, firstIds, records },
  ) => {
    const rootPath = path.join('_');
    const fieldPath = [...path, key].join('_');

    if (!root.type || fieldIs.foreignRelation(field)) {
      args.sort = args.sort || [];
    }
    const queryFields = Array.from(
      new Set([
        'id',
        ...fields,
        ...relations.filter(r => !r.foreign).map(r => r.name),
      ]),
    );
    if (root.type) {
      const rootField = fieldIs.relation(field) ? root.field : 'id';
      const relField = fieldIs.relation(field) ? 'id' : field.foreign;
      const relFilter = [
        relField,
        'in',
        records[rootPath].reduce(
          (res, root) => res.concat((root[rootField] as string[]) || []),
          [] as string[],
        ),
      ];
      args.filter = args.filter ? ['AND', args.filter, relFilter] : relFilter;
      if (!queryFields.includes(relField)) queryFields.push(relField);
    }
    const slice = {
      start: (args.start || 0) - extra.start,
      end: undefOr(args.end, args.end! + extra.end) as number | undefined,
    };
    records[fieldPath] = await db.find(
      field.type,
      {
        ...args,
        start: 0,
        end: undefOr(
          slice.end,
          (slice.start || 0) + slice.end! * (records[rootPath] || [{}]).length,
        ),
      },
      queryFields,
    );

    const dataIndices: Obj<true> = {};
    const setDataRecords = (filter?: (record: IdRecord) => boolean) => {
      let counter = 0;
      let result: string | null = null;
      records[fieldPath].forEach((record, i) => {
        if (!filter || filter(record)) {
          if (
            counter >= (slice.start || 0) &&
            (slice.end === undefined || counter < slice.end)
          ) {
            dataIndices[i] = true;
          }
          if (counter === (args.start || 0)) result = record.id;
          counter++;
        }
      });
      return result;
    };

    if (!root.type) {
      firstIds[fieldPath] = { '': setDataRecords() };
    } else {
      firstIds[fieldPath] = firstIds[fieldPath] || {};
      records[rootPath].forEach(rootRecord => {
        if (fieldIs.relation(field)) {
          if (!rootRecord[root.field]) {
            if (field.isList && args.sort) {
              firstIds[fieldPath][rootRecord.id] = null;
            }
          } else if (field.isList) {
            const value = rootRecord[root.field] as (string | null)[];
            const firstId = setDataRecords(r => value.includes(r.id));
            if (args.sort) firstIds[fieldPath][rootRecord.id] = firstId;
          } else {
            const value = rootRecord[root.field] as string;
            setDataRecords(r => r.id === value);
          }
        } else {
          firstIds[fieldPath][rootRecord.id] = setDataRecords(r => {
            const value = r[field.foreign] as string[] | string | null;
            return Array.isArray(value)
              ? value.includes(rootRecord.id)
              : value === rootRecord.id;
          });
        }
      });
    }

    data[field.type] = data[field.type] || {};
    records[fieldPath].forEach(({ id, ...record }, i) => {
      if (dataIndices[i]) {
        data[field.type][id] = data[field.type][id]
          ? { ...data[field.type][id], ...record }
          : record;
      }
    });

    await Promise.all(relations.map(r => r.walk()));
  },
);

const commit = async (
  commits: Obj<Obj<Record | null>>[] = [],
  schema: Obj<Obj<Field>>,
  db: Db,
) => {
  const result: Obj<Obj<string>>[] = [];
  for (const records of commits) {
    const types = Object.keys(records);
    const newIds = keysToObject<Obj<string>>(types, () => ({}));
    const getId = (type: string, id: string) => (newIds[type] || {})[id] || id;
    await Promise.all(
      types.map(async type => {
        await Promise.all(
          Object.keys(records[type]).map(async id => {
            if (!records[type][id]) {
              await db.delete(type, id);
            } else if (isNewId(id)) {
              const newId = await db.insert(type, records[type][id]!);
              newIds[type][id] = newId;
            } else {
              await db.update(type, id, records[type][id]!);
            }
          }),
        );
      }),
    );
    await Promise.all(
      types.map(async type =>
        Promise.all(
          Object.keys(records[type]).map(async id => {
            if (records[type][id]) {
              const record = { ...records[type][id] };
              let hasNewIds = false;
              for (const f of Object.keys(record)) {
                const field = schema[type][f];
                if (fieldIs.relation(field) && newIds[field.type]) {
                  const prev = record[f];
                  record[f] = mapArray(record[f], id => getId(field.type, id));
                  if (!isEqual(record[f], prev)) hasNewIds = true;
                }
              }
              if (hasNewIds) {
                await db.update(type, getId(type, id), record);
              }
            }
          }),
        ),
      ),
    );
    result.push(newIds);
  }
  return result;
};

export default function dbResolver(schema: Obj<Obj<Field>>, db: Db) {
  return (async (request?: ResolveRequest) => {
    if (!request) return schema;
    const newIds = await commit(request.commits, schema, db);
    const data = {};
    const firstIds = {} as Obj<Obj<string | null>>;
    await Promise.all(
      runner(request.queries || [], schema, {
        db,
        data,
        firstIds,
        records: {},
      }),
    );
    return { newIds, data, firstIds };
  }) as Resolver;
}
