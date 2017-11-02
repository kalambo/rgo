import {
  fieldIs,
  keysToObject,
  localPrefix,
  noUndef,
  Obj,
  RelationField,
  ScalarField,
} from '../core';

import { CommitPlugin, Connector, Info, Mutation } from './typings';

export default async function mutate(
  info: Info,
  connectors: Obj<Connector>,
  args,
  { newIds }: { newIds: Obj<Obj<string>> },
  plugins: CommitPlugin[],
) {
  const typeNames = Object.keys(args);
  const tempNewIds: Obj<Obj<string>> = {};
  const time = new Date();

  for (const type of typeNames) {
    tempNewIds[type] = tempNewIds[type] || {};
    args[type]
      .map(m => m.id)
      .filter(id => id.startsWith(localPrefix))
      .forEach(id => {
        tempNewIds[type][id] = connectors[type].newId();
      });
  }
  const getId = (type: string, id: string) =>
    (tempNewIds[type] || {})[id] || id;

  const mutations = keysToObject<Mutation[]>(typeNames, []);
  for (const type of typeNames) {
    for (const { id: tempId, ...mutation } of args[type]) {
      const id = getId(type, tempId);

      const data: Obj | null = Object.keys(mutation).length ? mutation : null;
      const prev: Obj | null =
        (id === tempId && (await connectors[type].findById(id))) || null;
      if (prev) delete prev.id;

      if (data) {
        for (const f of Object.keys(data)) {
          if (data[f]) {
            const field = info.schema[type][f] as RelationField | ScalarField;
            if (field.isList && data[f].length === 0) data[f] = null;
            if (fieldIs.relation(field)) {
              data[f] = field.isList
                ? data[f].map(v => getId(field.type, v))
                : getId(field.type, data[f]);
            }
          }
        }
        if (!prev && !data.createdat) data.createdat = time;
        if (!data.modifiedat) data.modifiedat = time;
      }

      mutations[type].push({ id, data, prev });
    }
  }

  try {
    for (const p of plugins) {
      await Promise.all(
        typeNames.map(async type => {
          mutations[type] = await Promise.all(
            mutations[type].map(async m => ({
              ...m,
              data: noUndef(await p({ ...m, type }, info), m.data),
            })),
          );
        }),
      );
    }
  } catch (error) {
    return error;
  }

  const results = keysToObject<Obj[]>(typeNames, []);
  for (const type of typeNames) {
    newIds[type] = { ...newIds[type], ...tempNewIds[type] };
    for (const { id, data, prev } of mutations[type]) {
      if (data) {
        if (prev) {
          await connectors[type].update(id, data);
        } else {
          await connectors[type].insert(id, data);
        }
        results[type].push({ id, ...prev, ...data });
      } else {
        await connectors[type].delete(id);
        results[type].push({ id });
      }
    }
  }

  return results;
}
