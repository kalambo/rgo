import {
  fieldIs,
  keysToObject,
  localPrefix,
  noUndef,
  Obj,
  Record,
  RelationField,
  ScalarField,
  Source,
} from '../core';

import { CommitPlugin, Info, Mutation } from './typings';

export default async function commit(
  info: Info,
  sources: Obj<Source>,
  plugins: CommitPlugin[],
  data: Obj<Obj<Record>>,
  commits: Obj<Obj<Record | null>>[],
) {
  return await Promise.all(
    commits.map(async commit => {
      const types = Object.keys(commit);
      const newIds: Obj<Obj<string>> = {};
      const time = new Date();

      for (const type of types) {
        newIds[type] = newIds[type] || {};
        for (const id of Object.keys(commit[type])) {
          if (id.startsWith(localPrefix)) {
            newIds[type][id] = sources[type].newId();
          }
        }
      }
      const getId = (type: string, id: string) =>
        (newIds[type] || {})[id] || id;

      const mutations = keysToObject<Mutation[]>(types, []);
      for (const type of types) {
        for (const tempId of Object.keys(commit[type])) {
          const id = getId(type, tempId);

          const record = commit[type][id];
          const prev = id === tempId ? await sources[type].findById(id) : null;
          if (prev) delete prev.id;

          if (record) {
            for (const f of Object.keys(record)) {
              if (record[f]) {
                const field = info.schema[type][f] as
                  | RelationField
                  | ScalarField;
                if (fieldIs.relation(field)) {
                  record[f] = field.isList
                    ? (record[f] as any[]).map(v => getId(field.type, v))
                    : getId(field.type, record[f] as string);
                }
                if (field.isList && (record[f] as any[]).length === 0) {
                  record[f] = null;
                }
              }
            }
            if (!prev && !record.createdat) record.createdat = time;
            if (!record.modifiedat) record.modifiedat = time;
          }

          mutations[type].push({ id, record, prev });
        }
      }

      try {
        for (const onCommit of plugins) {
          await Promise.all(
            types.map(async type => {
              mutations[type] = await Promise.all(
                mutations[type].map(async m => ({
                  ...m,
                  record: noUndef(
                    await onCommit({ ...m, type }, info),
                    m.record,
                  ),
                })),
              );
            }),
          );
        }
      } catch (error) {
        return error.message as string;
      }

      for (const type of types) {
        for (const { id, record, prev } of mutations[type]) {
          if (record) {
            if (prev) {
              await sources[type].update(id, record);
            } else {
              await sources[type].insert(id, record);
            }
            data[type] = data[type] || {};
            data[type][id] = record;
          } else {
            await sources[type].delete(id);
          }
        }
      }
      return newIds;
    }),
  );
}
