import { Field, fieldIs, keysToObject, Obj, Query } from '../core';

import { AuthConfig, Connector, Mutation } from './typings';

export default async function mutate(
  fields: Obj<Obj<Field>>,
  connectors: Obj<Connector>,
  runQuery: (query: Query | Query[]) => Promise<Obj>,
  args,
  {
    user,
    mutationsInfo,
  }: {
    user: Obj | null;
    mutationsInfo: { mutations: Obj<Mutation[]>; newIds: Obj<Obj<string>> };
  },
  auth?: AuthConfig,
) {
  const typeNames = Object.keys(args);
  const newIds: Obj<Obj<string>> = {};

  for (const type of typeNames) {
    newIds[type] = newIds[type] || {};
    args[type]
      .map(m => m.id)
      .filter(id => id.startsWith('LOCAL__RECORD__'))
      .forEach(id => {
        newIds[type][id] = connectors[type].newId();
      });
  }
  const getId = (type: string, id: string) =>
    ({
      ...(newIds[type] || {}),
      $user: (user && user.id) || '',
    }[id] || id);

  const mutations = keysToObject(typeNames, () => [] as Mutation[]);
  for (const type of typeNames) {
    for (const { id, ...mutation } of args[type]) {
      const mId = getId(type, id);

      for (const f of Object.keys(fields[type])) {
        const field = fields[type][f];
        if (fieldIs.relation(field) && mutation[f]) {
          mutation[f] = field.isList
            ? mutation[f].map(v => getId(field.type, v))
            : getId(field.type, mutation[f]);
        }
      }

      const data: Obj | null = Object.keys(mutation).length ? mutation : null;
      const prev: Obj | null =
        (id === mId && (await connectors[type].findById(mId))) || null;
      if (prev) delete prev.id;

      if (auth && type === auth.type && data && data[auth.usernameField]) {
        const { username, password } = JSON.parse(data[auth.usernameField]);
        delete data[auth.usernameField];
        if (!prev || prev[auth.usernameField] !== username) {
          const existingUser = await connectors[type].query({
            filter: ['AND', [auth.usernameField, username], ['id', '!=', mId]],
            end: 1,
            fields: ['id'],
          });
          if (existingUser.length > 0) {
            const error = new Error('Username already exists') as any;
            error.status = 400;
            return error;
          }
        }
        if (username) data[auth.usernameField] = username;
        if (password && (!prev || !prev[auth.authIdField])) {
          data[auth.authIdField] = password;
        }
      }

      const combinedData = { ...prev, ...data };
      if (
        auth &&
        !await auth.allowMutation(
          fields,
          runQuery,
          user,
          type,
          mId,
          data && combinedData,
          prev,
        )
      ) {
        const error = new Error('Not authorized') as any;
        error.status = 401;
        return error;
      }

      if (data) {
        for (const f of Object.keys(combinedData)) {
          const field = fields[type][f];
          if (!fieldIs.foreignRelation(field)) {
            if (field.isList && data && data[f] && data[f].length === 0) {
              data[f] = null;
            }
          }
        }
      }
      mutations[type].push({ id: mId, data, prev });
    }
  }

  const results = keysToObject(typeNames, () => [] as Obj[]);
  for (const type of typeNames) {
    mutationsInfo.mutations[type] = mutationsInfo.mutations[type] || [];
    mutationsInfo.newIds[type] = {
      ...mutationsInfo.newIds[type],
      ...newIds[type],
    };
    for (const { id, data, prev } of mutations[type]) {
      if (data) {
        const time = new Date();
        const fullData = {
          ...!prev ? { createdat: time } : {},
          modifiedat: time,
          ...data,
        };

        if (auth && type === auth.type && fullData[auth.authIdField]) {
          const username = fullData[auth.usernameField];
          const password = fullData[auth.authIdField];
          fullData[auth.authIdField] = await auth.createAuth(
            username,
            password,
            id,
            auth.metaFields &&
              keysToObject(
                auth.metaFields.filter(
                  f => fullData[f] !== undefined && fullData[f] !== null,
                ),
                f => fullData[f],
              ),
          );
          mutationsInfo.newIds['$user'] = { username, password };
        }

        if (prev) {
          console.log(
            `kalambo-mutate-update, ${type}:${id}, ` +
              `old: ${JSON.stringify(prev)}, new: ${JSON.stringify(fullData)}`,
          );
          await connectors[type].update(id, fullData);
        } else {
          console.log(
            `kalambo-mutate-insert, ${type}:${id}, new: ${JSON.stringify(
              fullData,
            )}`,
          );
          await connectors[type].insert(id, fullData);
        }
        mutationsInfo.mutations[type].push({ id, data: fullData, prev });
        results[type].push({ id, ...prev, ...fullData });
      } else {
        console.log(
          `kalambo-mutate-delete, ${type}:${id}, old: ${JSON.stringify(prev)}`,
        );
        await connectors[type].delete(id);
        mutationsInfo.mutations[type].push({ id, data, prev });
        results[type].push({ id });
      }
    }
  }

  return results;
}
