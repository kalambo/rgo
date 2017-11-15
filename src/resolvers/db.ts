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
import { isEqual, mapArray, newIdPrefix, undefOr } from '../utils';
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
    { root, field, args, fields, offset, relations, path, key },
    { db, data, firstIds, records },
    walkRelations,
  ) => {
    const rootPath = path.join('_');
    const fieldPath = [...path, key].join('_');

    if (!root.type || fieldIs.foreignRelation(field)) {
      args.sort = args.sort || [];
    }
    const queryFields = Array.from(new Set(['id', ...fields, ...relations]));
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
    records[fieldPath] = await db.find(
      field.type,
      {
        ...args,
        start: 0,
        end: undefOr(
          args.end,
          (args.start || 0) + args.end! * (records[rootPath] || [{}]).length,
        ),
      },
      queryFields,
    );

    data[field.type] = data[field.type] || {};
    records[fieldPath].forEach(({ id, ...record }) => {
      data[field.type][id] = data[field.type][id]
        ? { ...data[field.type][id], ...record }
        : record;
    });

    const first = (args.start || 0) + offset;
    if (!root.type) {
      firstIds[fieldPath] = firstIds[fieldPath] || {};
      firstIds[fieldPath][''] = records[fieldPath][first]
        ? records[fieldPath][first].id
        : null;
    } else if (fieldIs.foreignRelation(field) || (field.isList && args.sort)) {
      firstIds[fieldPath] = firstIds[fieldPath] || {};
      records[rootPath].forEach(rootRecord => {
        if (fieldIs.relation(field)) {
          const value = rootRecord[root.field] as (string | null)[] | null;
          if (!value) {
            firstIds[fieldPath][rootRecord.id] = null;
          } else if (args.sort) {
            const firstRecord = records[fieldPath].filter(r =>
              value.includes(r.id),
            )[first] as IdRecord | null | undefined;
            firstIds[fieldPath][rootRecord.id] = firstRecord
              ? firstRecord.id
              : null;
          } else {
            firstIds[fieldPath][rootRecord.id] = value[first] || null;
          }
        } else {
          const firstRecord = records[fieldPath].filter(r => {
            const value = r[field.foreign] as string[] | string | null;
            return Array.isArray(value)
              ? value.includes(rootRecord.id)
              : value === rootRecord.id;
          })[first] as IdRecord | undefined;
          firstIds[fieldPath][rootRecord.id] = firstRecord
            ? firstRecord.id
            : null;
        }
      });
    }

    await Promise.all(walkRelations());
  },
);

const commit = async (
  commits: Obj<Obj<Record | null>>[],
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
            } else if (id.startsWith(newIdPrefix)) {
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
      runner(request.queries, schema, {
        db,
        data,
        firstIds,
        records: {},
      }),
    );
    return { newIds, data, firstIds };
  }) as Resolver;
}
