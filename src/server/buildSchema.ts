import {
  ExecutionResult, graphql, GraphQLID, GraphQLInputObjectType, GraphQLInt, GraphQLList,
  GraphQLNonNull, GraphQLObjectType, GraphQLResolveInfo, GraphQLSchema, GraphQLString,
} from 'graphql';
import { keysToObject, Obj } from 'mishmash';

import { fieldIs, parseArgs, scalars } from '../core';

import batch from './batch';
import mutate from './mutate';
import { DataType } from './typings';

const argTypes = {
  filter: { type: GraphQLString },
  sort: { type: GraphQLString },
  skip: { type: GraphQLInt },
  show: { type: GraphQLInt },
};

export default function buildSchema(types: Obj<DataType>) {

  const typeNames = Object.keys(types);

  const baseFields = {
    id: { type: new GraphQLNonNull(GraphQLID) },
    createdAt: { type: scalars.Date.type },
    modifiedAt: { type: scalars.Date.type },
  };

  const queryTypes = keysToObject(typeNames, type => new GraphQLObjectType({
    name: type,
    fields: () => ({

      ...baseFields,

      ...keysToObject(Object.keys(types[type].fields), f => {

        const field = types[type].fields[f];

        if (fieldIs.scalar(field)) {
          const scalar = scalars[field.scalar].type;
          return { type: field.isList ? new GraphQLList(scalar) : scalar };
        }

        const relQueryType = queryTypes[field.relation.type];
        return {
          type: (fieldIs.foreignRelation(field) || field.isList) ?
            new GraphQLList(relQueryType) : relQueryType,
          args: argTypes,
          resolve: batch(async (
            roots: any[], args, { userId }: { userId: string | null }, info: GraphQLResolveInfo,
          ) => {

            const { fields, connector, auth } = types[field.relation.type];

            const rootField = fieldIs.relation(field) ? f : 'id';
            const relField = fieldIs.relation(field) ? 'id' : field.relation.field;

            const queryArgs = parseArgs(args, userId, fields, info);
            queryArgs.fields = [relField, ...(queryArgs.fields || [])];
            queryArgs.filter = {
              ...queryArgs.filter,
              [relField]: { $in: roots.reduce((res, root) => res.concat(root[rootField]), []) },
            };
            const authArgs = auth.query ? await auth.query(userId, queryArgs) : queryArgs;

            const results = await connector.query(authArgs);

            return roots.map(root => {
              if (fieldIs.relation(field)) {
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

    }),
  }));

  const inputTypes = keysToObject(typeNames, type => new GraphQLInputObjectType({
    name: `${type}Input`,
    fields: ({

      ...baseFields,

      ...keysToObject(Object.keys(types[type].fields), f => {

        const field = types[type].fields[f];

        if (fieldIs.scalar(field) && field.isList) {
          const scalar = scalars[field.scalar].type;
          return { type: field.isList ? new GraphQLList(scalar) : scalar };
        }

        if (fieldIs.relation(field)) {
          return { type: field.isList ? new GraphQLList(scalars.ID.type) : scalars.ID.type, };
        }

      }),

    }),
  }));

  const schema = new GraphQLSchema({

    query: new GraphQLObjectType({
      name: 'Query',
      fields: {
        ...keysToObject(typeNames, type => ({
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
        SCHEMA: {
          type: scalars.JSON.type,
          resolve: () => JSON.stringify(
            keysToObject(typeNames, type => types[type].fields),
            (_, v) => typeof v === 'function' ? true : v,
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
              type: new GraphQLList(new GraphQLNonNull(queryTypes[type]))
            })),
          }),
          args: keysToObject(typeNames, type => ({
            type: new GraphQLList(new GraphQLNonNull(inputTypes[type])),
          })),
          async resolve(_root, args, context: { userId: string | null }) {
            return mutate(types, args, context);
          },
        }
      },
    }),

  });

  return async (query: string, context?: any, variables?: any): Promise<ExecutionResult> => (
    graphql(schema, query, null, { ...context, rootQuery: query }, variables)
  );

}
