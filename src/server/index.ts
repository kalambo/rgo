import * as connectors from './connectors';
export { connectors };

import {
  ExecutionResult,
  graphql,
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';
import { keysToObject, Obj } from 'mishmash';

import { Field, fieldIs, parseArgs, scalars } from '../core';

import batch from './batch';
import mutate from './mutate';
import { DataType, QueryConfig } from './typings';

const nullIfEmpty = (array: any[]) => (array.length === 0 ? null : array);

const argTypes = {
  filter: { type: GraphQLString },
  sort: { type: GraphQLString },
  skip: { type: GraphQLInt },
  show: { type: GraphQLInt },
  extra: {
    type: new GraphQLInputObjectType({
      name: 'Extra',
      fields: { skip: { type: GraphQLInt }, show: { type: GraphQLInt } },
    }),
  },
};

export default function buildServer(types: Obj<DataType>) {
  const typeNames = Object.keys(types);

  const typeFields = keysToObject<string, Obj<Field>>(typeNames, type => ({
    id: {
      scalar: 'String',
    },
    createdAt: {
      scalar: 'Date',
    },
    modifiedAt: {
      scalar: 'Date',
    },
    ...types[type].fields,
  }));

  const queryTypes = keysToObject(
    typeNames,
    type =>
      new GraphQLObjectType({
        name: type,
        fields: () =>
          keysToObject(Object.keys(typeFields[type]), f => {
            const field = typeFields[type][f];

            if (fieldIs.scalar(field)) {
              const scalar =
                f === 'id'
                  ? new GraphQLNonNull(GraphQLID)
                  : scalars[field.scalar].type;
              return { type: field.isList ? new GraphQLList(scalar) : scalar };
            }

            const relQueryType = queryTypes[field.type];
            return {
              type:
                fieldIs.foreignRelation(field) || field.isList
                  ? new GraphQLList(relQueryType)
                  : relQueryType,
              args:
                fieldIs.relation(field) && !field.isList ? undefined : argTypes,
              resolve: batch(
                async (
                  roots: any[],
                  args,
                  { userId }: { userId: string | null },
                  info: GraphQLResolveInfo,
                ) => {
                  const rootField = fieldIs.relation(field) ? f : 'id';
                  const relField = fieldIs.relation(field)
                    ? 'id'
                    : field.foreign;

                  const queryArgs = parseArgs(
                    args,
                    userId,
                    typeFields[field.type],
                    info,
                  );
                  queryArgs.fields = [relField, ...(queryArgs.fields || [])];
                  queryArgs.filter = {
                    ...queryArgs.filter,
                    [relField]: {
                      $in: roots.reduce(
                        (res, root) => res.concat(root[rootField]),
                        [],
                      ),
                    },
                  };

                  const auth = types[field.type].auth;
                  const authArgs = auth.query
                    ? await auth.query(userId, queryArgs)
                    : queryArgs;

                  const results = await types[field.type].connector.query(
                    authArgs,
                  );

                  return roots.map(root => {
                    if (fieldIs.relation(field)) {
                      if (!root[f]) return null;
                      if (!field.isList) {
                        return results.find(r => r.id === root[f]);
                      }
                      if (args.sort) {
                        const res = results.filter(r => root[f].includes(r.id));
                        return res.length > 0 ? res : null;
                      }
                      return root[f].map(id => results.find(r => r.id === id));
                    }
                    const res = results.filter(
                      r =>
                        Array.isArray(r[relField])
                          ? r[relField].includes(root.id)
                          : r[relField] === root.id,
                    );
                    return res.length > 0 ? res : null;
                  });
                },
              ),
            };
          }),
      }),
  );

  const inputTypes = keysToObject(
    typeNames,
    type =>
      new GraphQLInputObjectType({
        name: `${type}Input`,
        fields: keysToObject(Object.keys(typeFields[type]), f => {
          const field = typeFields[type][f];

          if (fieldIs.scalar(field)) {
            const scalar =
              f === 'id'
                ? new GraphQLNonNull(GraphQLID)
                : scalars[field.scalar].type;
            return { type: field.isList ? new GraphQLList(scalar) : scalar };
          }

          if (fieldIs.relation(field)) {
            return {
              type: field.isList ? new GraphQLList(GraphQLID) : GraphQLID,
            };
          }
        }),
      }),
  );

  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        ...keysToObject(typeNames, type => ({
          type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
          args: {
            ids: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
            ...argTypes,
          },
          async resolve(
            _root: any,
            args,
            { userId }: { userId: string | null },
            info: GraphQLResolveInfo,
          ) {
            if (args.ids) {
              return nullIfEmpty(
                await types[type].connector.findByIds(args.ids),
              );
            } else {
              const queryArgs = parseArgs(args, userId, typeFields[type], info);

              const auth = types[type].auth;
              const authArgs = auth.query
                ? await auth.query(userId, queryArgs)
                : queryArgs;

              return nullIfEmpty(await types[type].connector.query(authArgs));
            }
          },
        })),
        SCHEMA: {
          type: scalars.JSON.type,
          resolve: () =>
            JSON.stringify(
              typeFields,
              (_, v) => (typeof v === 'function' ? true : v),
            ),
        },
      },
    }),

    mutation: new GraphQLObjectType({
      name: 'Mutation',
      fields: {
        mutate: {
          type: new GraphQLObjectType({
            name: 'MutationResult',
            fields: keysToObject(typeNames, type => ({
              type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
            })),
          }),
          args: keysToObject(typeNames, type => ({
            type: new GraphQLList(new GraphQLNonNull(inputTypes[type])),
          })),
          async resolve(_root, args, context: { userId: string | null }) {
            return mutate(types, args, context);
          },
        },
      },
    }),
  });

  const runQuery = async (config: QueryConfig, context: any) =>
    graphql(
      schema,
      config.query,
      null,
      { ...context, rootQuery: config.query },
      config.variables,
    );

  return async (
    config: QueryConfig | QueryConfig[],
    context?: any,
  ): Promise<ExecutionResult | ExecutionResult[]> =>
    Array.isArray(config)
      ? Promise.all(config.map(c => runQuery(c, context)))
      : runQuery(config, context);
}
