import {
  GraphQLInputObjectType, GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLObjectType,
  GraphQLResolveInfo, GraphQLSchema, GraphQLString,
} from 'graphql';
import { Obj } from 'mishmash';

import { isForeignRelation, isRelation, isScalar, keysToObject, parseArgs, scalars } from '../core';

import batch from './batch';
import mutate from './mutate';
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
        const scalar = scalars[field.scalar].type;
        return { type: field.isList ? new GraphQLList(scalar) : scalar };
      }

      const relQueryType = queryTypes[field.relation.type];
      return {
        type:
          (isForeignRelation(field) || field.isList) ? new GraphQLList(relQueryType) : relQueryType,
        args: argTypes,
        resolve: batch(async (
          roots: any[], args, { userId }: { userId: string | null }, info: GraphQLResolveInfo,
        ) => {

          const { fields, connector, auth } = types[field.relation.type];

          const rootField = isRelation(field) ? f : 'id';
          const relField = isRelation(field) ? 'id' : field.relation.field;

          const queryArgs = parseArgs(args, userId, fields, info);
          queryArgs.fields = [relField, ...(queryArgs.fields || [])];
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
        const scalar = scalars[field.scalar].type;
        return { type: field.isList ? new GraphQLList(scalar) : scalar };
      }

      if (isRelation(field)) {
        return { type: field.isList ? new GraphQLList(scalars.ID.type) : scalars.ID.type, };
      }

    }),
  }));

  return new GraphQLSchema({

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
        _schema: {
          type: queryTypes.JSON,
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

}
