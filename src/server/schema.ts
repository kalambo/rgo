import {
  GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType,
  GraphQLResolveInfo, GraphQLSchema, GraphQLString,
} from 'graphql';
import { Obj } from 'mishmash';

import { isRelation, isScalar, keysToObject, parseArgs } from '../core';

import batch from './batch';
import scalarTypes from './scalarTypes';
import { DataType } from './typings';

const argTypes = {
  filter: { type: GraphQLString },
  sort: { type: GraphQLString },
  skip: { type: GraphQLInt },
  show: { type: GraphQLInt },
};

export default function createSchema(types: Obj<DataType>) {

  const typeNames = Object.keys(types);

  const queryTypes = keysToObject(typeNames, type => new GraphQLObjectType({
    name: type,
    fields: () => keysToObject(Object.keys(types[type].fields), f => {

      const field = types[type].fields[f];

      if (isScalar(field)) {
        const scalar = scalarTypes[field.scalar];
        return {
          type: field.isList ? new GraphQLList(scalar) : scalar,
        };
      }

      const relQueryType = queryTypes[field.relation.type];
      return {
        type: !isRelation(field) || field.isList ? new GraphQLList(relQueryType) : relQueryType,
        args: argTypes,
        resolve: batch(async (
          roots: any[], args, { userId }: { userId: string | null }, info: GraphQLResolveInfo,
        ) => {

          const { fields, connector, auth } = types[field.relation.type];

          const rootField = isRelation(field) ? f : 'id';
          const relField = isRelation(field) ? 'id' : field.relation.field;

          const queryArgs = parseArgs(args, userId, fields, info);
          queryArgs.fields.push(relField);
          queryArgs.filter = {
            ...queryArgs.filter,
            [relField]: { $in: roots.reduce((res, root) => res.concat(root[rootField]), []) },
          };
          const authArgs = auth.query ? await auth.query(userId, queryArgs) : queryArgs;

          const results = await connector.query(authArgs);

          return roots.map(root => {
            if (isRelation(field)) {
              if (!field.isList) return results.find(res => res.id === root[f]);
              return root[f] && root[f].map(id => results.find(res => res.id === id));
            }
            return results.filter(res =>
              Array.isArray(res[relField]) ? res[relField].includes(root.id) :
                res[relField] === root.id
            );
          });

        }),
      };

    }),
  }));

  const inputTypes = keysToObject(typeNames, type => new GraphQLInputObjectType({
    name: `${type}Input`,
    fields: keysToObject(Object.keys(types[type].fields), f => {

      const field = types[type].fields[f];

      if (isScalar(field) && field.isList) {
        const scalar = scalarTypes[field.scalar];
        return {
          type: field.isList ? new GraphQLList(scalar) : scalar,
        };
      }

      if (isRelation(field)) {
        return {
          type: field.isList ? new GraphQLList(scalarTypes.ID) : scalarTypes.ID,
        };
      }

    }),
  }));

  return new GraphQLSchema({

    query: new GraphQLObjectType({
      name: 'Query',
      fields: keysToObject(typeNames, type => ({
        type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
        args: argTypes,
        async resolve(
          _root: any, args, { userId }: { userId: string | null }, info: GraphQLResolveInfo,
        ) {

          const { fields, connector, auth } = types[type];

          const queryArgs = parseArgs(args, userId, fields, info);
          const authArgs = auth.query ? await auth.query(userId, queryArgs) : queryArgs;

          return connector.query(authArgs);

        },
      })),
    }),

    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        mutate: {
          type: new GraphQLObjectType({
            name: 'MutationResult',
            fields: keysToObject(typeNames, type => ({
              type: new GraphQLList(new GraphQLNonNull(queryTypes[type]))
            })),
          }),
          args: keysToObject(typeNames, type => ({
            type: new GraphQLList(new GraphQLNonNull(inputTypes[type])),
          })),
          async resolve(_root, args, { userId }: { userId: string | null }) {

            const newIds = {
              $user: userId || '',
              ...keysToObject(typeNames, type => keysToObject(
                args[type].map(m => m.id).filter(id => id[0] === '$'),
                types[type].newId,
              )),
            };

            const mutations = keysToObject(typeNames, () => [] as any[]);
            for (const type of typeNames) {
              for (const { id, ...mutation } of args[type]) {

                const { fields, connector, auth } = types[type];

                const mId = newIds[type][id] || id;

                for (const f of Object.keys(fields)) {
                  if (Array.isArray(mutation[f])) {
                    mutation[f] = mutation[f].map(v => newIds[type][v] || v);
                  } else if (mutation[f]) {
                    mutation[f] = newIds[type][mutation[f]] || mutation[f];
                  }
                }

                const data: Obj | null = Object.keys(mutation).length ? mutation : null;
                const prev: Obj | null = (id === mId) && (await connector.findById(mId)) || null;
                if (prev) delete prev.id;

                const mutateArgs = { id: mId, data, prev };

                let allow = true;
                if (data && prev && auth.update) allow = await auth.update(userId, id, data, prev);
                else if (data && !prev && auth.insert) allow = await auth.insert(userId, id, data);
                else if (!data && auth.delete) allow = await auth.delete(userId, id, prev);

                if (!allow) {
                  const error = new Error('Not authorized') as any;
                  error.status = 401;
                  return error;
                }

                mutations[type].push(mutateArgs);

              }
            }

            const results = keysToObject(typeNames, () => [] as any[]);
            for (const type of typeNames) {
              for (const { id, data, prev } of mutations[type]) {

                const { fields, connector } = types[type];

                if (data) {

                  const time = new Date();

                  const combinedData = { ...prev, ...data };
                  const formulae = {};
                  for (const f of Object.keys(fields)) {
                    const field = fields[f];
                    if (isScalar(field) && typeof field.formula === 'function') {
                      formulae[f] = await field.formula(combinedData, connector.query);
                    }
                  }

                  const fullData = {
                    ...(!prev ? { createdAt: time } : {}),
                    modifiedAt: time,
                    ...data,
                    ...formulae,
                  };

                  if (prev) await connector.update(id, fullData);
                  else await connector.insert(id, fullData);
                  results[type].push({ id, ...prev, ...fullData });

                }

                await connector.delete(id);
                results[type].push({ id });

              }
            }

            return results;

          },
        }
      },
    }),

  });

}
