import * as deepEqual from 'deep-equal';

import {
  Args,
  Field,
  fieldIs,
  IdRecord,
  Obj,
  Record,
  RelationField,
  ResolveRequest,
  ScalarField,
} from '../typings';
import { keysToObject, localPrefix, undefOr } from '../utils';
import walker from '../walker';

export interface Connector {
  query: (
    type: string,
    args: Args,
    fields: string[],
  ) => IdRecord[] | Promise<IdRecord[]>;
  upsert: (
    type: string,
    id: string | null,
    record: Record,
  ) => IdRecord | Promise<IdRecord>;
  delete: (type: string, id: string) => void | Promise<void>;
  prepare?: (type: string, record: IdRecord) => IdRecord | Promise<IdRecord>;
}

const runner = walker<
  Promise<void>,
  {
    connector: Connector;
    data: Obj<Obj<Record>>;
    firstIds: Obj<Obj<string | null>>;
    records: Obj<IdRecord[]>;
  }
>(
  async (
    { root, field, args, fields, offset, relations, path, key },
    { connector, data, firstIds, records },
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
    records[fieldPath] = await connector.query(
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

const update = async (
  updates: Obj<IdRecord[]>[],
  schema: Obj<Obj<Field>>,
  connector: Connector,
  data: Obj<Obj<Record>>,
) =>
  Promise.all(
    updates.map(async updateRecords => {
      const types = Object.keys(updateRecords);
      const records: Obj<IdRecord[]> = {};
      try {
        await Promise.all(
          types.map(async type => {
            records[type] = connector.prepare
              ? await Promise.all(
                  updateRecords[type].map(r => connector.prepare!(type, r)),
                )
              : updateRecords[type];
          }),
        );
      } catch (error) {
        return error.message;
      }

      const newIds = keysToObject<Obj<string>>(types, {});
      const getId = (type: string, id: string) =>
        (newIds[type] || {})[id] || id;
      await Promise.all(
        types.map(async type => {
          data[type] = data[type] || {};
          await Promise.all(
            records[type].map(async ({ id, ...record }) => {
              if (Object.keys(record).length === 0) {
                await connector.delete(type, id);
              } else if (id.startsWith(localPrefix)) {
                const { id: newId, ...r } = await connector.upsert(
                  type,
                  null,
                  record,
                );
                newIds[type][id] = newId;
                data[type][newId] = r;
              } else {
                const { id: _, ...r } = await connector.upsert(
                  type,
                  id,
                  record,
                );
                data[type][id] = { ...data[type][id], ...r };
              }
            }),
          );
        }),
      );
      await Promise.all(
        types.map(async type =>
          Promise.all(
            records[type].map(async ({ id: tempId, ...record }) => {
              if (Object.keys(record).length !== 0) {
                const id = getId(type, tempId);
                let hasNewId = false;
                for (const f of Object.keys(record)) {
                  if (record[f]) {
                    const field = schema[type][f] as
                      | RelationField
                      | ScalarField;
                    if (fieldIs.relation(field)) {
                      const prev = record[f];
                      record[f] = field.isList
                        ? (record[f] as any[]).map(v => getId(field.type, v))
                        : getId(field.type, record[f] as string);
                      if (!deepEqual(record[f], prev)) hasNewId = true;
                    }
                  }
                }
                if (hasNewId) {
                  const { id: _, ...r } = await connector.upsert(
                    type,
                    id,
                    record,
                  );
                  data[type][id] = { ...data[type][id], ...r };
                }
              }
            }),
          ),
        ),
      );
      return newIds;
    }),
  );

export default function simpleResolver(
  schema: Obj<Obj<Field>>,
  connector: Connector,
) {
  return async (request: ResolveRequest) => {
    const data = {};
    const newIds = await update(request.updates, schema, connector, data);
    const firstIds = {} as Obj<Obj<string | null>>;
    await Promise.all(
      runner(request.queries, schema, {
        connector,
        data,
        firstIds,
        records: {},
      }),
    );
    return { data, newIds, firstIds };
  };
}
