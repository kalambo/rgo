import { mapFilterUser, Obj } from '../../core';

import { Plugin } from '../typings';

export default function auth(
  authType: string,
  usernameField: string,
  authField: string,
  createAuth: (
    username: string,
    password: string,
    userId: string,
    record: Obj,
  ) => Promise<string>,
  getUserId: (token: string) => Promise<string | null>,
): Plugin {
  return {
    async onRequest({ headers }, { schema, runQuery }) {
      if (headers.authorization) {
        const [authType, authString] = headers.authorization.split(' ');
        if (authType === 'Bearer') {
          const userId = await getUserId(authString);
          if (userId) {
            return {
              user: await runQuery({
                name: authType,
                filter: userId,
                fields: Object.keys(schema[authType]),
              }),
            };
          }
        }
        throw new Error('Not authorized');
      }
    },
    onFilter(filter, info) {
      return mapFilterUser(filter, info.context.user && info.context.user.id);
    },
    async onCommit({ type, id, data, prev }, { runQuery }) {
      const result = { ...data };
      if (
        type === authType &&
        data &&
        (data[usernameField] || data[authField])
      ) {
        delete result[authField];
        if (result[usernameField]) {
          if ((prev && prev[usernameField]) !== result[usernameField]) {
            const response = await runQuery({
              name: authType,
              filter: [
                'AND',
                [usernameField, result[usernameField]],
                ['id', '!=', id],
              ],
              end: 1,
              fields: ['id'],
            });
            if (response[type][0]) throw new Error('Username already exists');
          }
          if (data[authField]) {
            if (prev && prev[authField]) {
              throw new Error('User already has account');
            }
            result[authField] = await createAuth(
              result[usernameField],
              data[authField],
              id,
              { ...prev, ...data },
            );
          }
        }
      }
      return result;
    },
  };
}
