import { standardizeSchema, standardizeUpdates } from './standardize';
import {
  Connector,
  Field,
  fieldIs,
  IdRecord,
  Obj,
  Record,
  RelationField,
  ScalarField,
} from './typings';
import { keysToObject, localPrefix } from './utils';

export default async function update(
  updates: Obj<IdRecord[]>[],
  schema: Obj<Obj<Field>>,
  connector: Connector,
  data: Obj<Obj<Record>>,
) {
  const standardSchema = standardizeSchema(schema);
  const standardUpdates = standardizeUpdates(updates, standardSchema);

  return await Promise.all(
    standardUpdates.map(async updateRecords => {
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
                      hasNewId = true;
                      record[f] = field.isList
                        ? (record[f] as any[]).map(v => getId(field.type, v))
                        : getId(field.type, record[f] as string);
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
}
