import * as baseConnectors from './connectors';
export { baseConnectors as connectors };
export { ServerPlugin } from './typings';

import {
  execute,
  GraphQLBoolean,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  parse,
} from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  ForeignRelationField,
  keysToObject,
  Obj,
  printArgs,
  Query,
  QueryRequest,
  QueryResponse,
  RelationField,
  ScalarField,
} from '../core';

import batch from './batch';
import commit from './commit';
import getRecords from './getRecords';
import normalizeResult from './normalize';
import { Connector, Info, ServerPlugin } from './typings';

const parseLiteral = ast => {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT: {
      return keysToObject(
        ast.fields,
        field => parseLiteral(field.value),
        field => field.name.value,
      );
    }
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
};
const scalars = {
  boolean: GraphQLBoolean,
  int: GraphQLInt,
  float: GraphQLFloat,
  string: GraphQLString,
  date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    serialize: value => value && new Date(value).getTime(),
    parseValue: value => value && new Date(value),
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) return parseInt(ast.value, 10);
      return null;
    },
  }),
  json: new GraphQLScalarType({
    name: 'JSON',
    description: 'JSON custom scalar type',
    serialize: value => value,
    parseValue: value => value,
    parseLiteral,
  }),
};

const argTypes = {
  filter: { type: scalars.json },
  sort: { type: scalars.json },
  start: { type: GraphQLInt },
  end: { type: GraphQLInt },
  offset: { type: GraphQLInt },
  trace: {
    type: new GraphQLInputObjectType({
      name: 'Trace',
      fields: {
        start: { type: new GraphQLNonNull(GraphQLInt) },
        end: { type: GraphQLInt },
      },
    }),
  },
};

const printQuery = (
  schema: Obj<Obj<Field>>,
  { name, alias, fields, ...args }: Query<string>,
  field: ForeignRelationField | RelationField,
) => {
  const base = `${alias ? `${alias}:` : ''}${name}`;
  const printedArgs =
    fieldIs.foreignRelation(field) || field.isList
      ? printArgs(args, schema[field.type])
      : '';
  return `${base}${printedArgs} {
    ${fields
      .map(
        f =>
          typeof f === 'string'
            ? fieldIs.scalar(schema[field.type][f]) ? f : `${f} {\nid\n}`
            : printQuery(schema, f, schema[field.type][f.name] as
                | ForeignRelationField
                | RelationField),
      )
      .join('\n')}
  }`;
};

export default async function buildServer(
  schema: Obj<{ fields: Obj<Field>; connector: Connector }>,
  ...plugins: ServerPlugin[]
) {
  async function api(
    request: QueryRequest,
    headers: Obj,
  ): Promise<QueryResponse>;
  async function api(
    request: QueryRequest[],
    headers: Obj,
  ): Promise<QueryResponse[]>;
  async function api(request: QueryRequest | QueryRequest[], headers: Obj) {
    const typeNames = Object.keys(schema);
    const connectors = keysToObject<Connector>(
      typeNames,
      type => schema[type].connector,
    );
    const info: Info = {
      schema: keysToObject<Obj<Field>>(typeNames, type => ({
        id: { scalar: 'string' },
        createdat: { scalar: 'date' },
        modifiedat: { scalar: 'date' },
        ...schema[type].fields,
      })),
      async runQuery(query: Query<string> | Query<string>[]) {
        const queryDoc = parse(`{
          ${Array.isArray(query)
            ? query
            : [query]
                .map(q =>
                  printQuery(info.schema, q, { type: q.name, isList: true }),
                )
                .join('\n')}
        }`);
        return (await execute(graphQLSchema, queryDoc, null, {
          rootQuery: query,
          internal: true,
        })).data!;
      },
      context: {},
    };
    for (const p of plugins) {
      if (p.onRequest) {
        info.context = {
          ...((await p.onRequest({ request, headers }, info)) || {}),
        };
      }
    }

    const queryTypes = keysToObject(
      typeNames,
      type =>
        new GraphQLObjectType({
          name: type,
          fields: () =>
            keysToObject(Object.keys(info.schema[type]), f => {
              const field = info.schema[type][f];

              if (fieldIs.scalar(field)) {
                const scalar =
                  f === 'id'
                    ? new GraphQLNonNull(GraphQLID)
                    : scalars[field.scalar];
                return {
                  type: field.isList
                    ? new GraphQLNonNull(new GraphQLList(scalar))
                    : scalar,
                  description: JSON.stringify(field),
                  resolve(root) {
                    return root && (field.isList ? root[f] || [] : root[f]);
                  },
                };
              }

              const relQueryType = queryTypes[field.type];
              return {
                type:
                  fieldIs.foreignRelation(field) || field.isList
                    ? new GraphQLNonNull(new GraphQLList(relQueryType))
                    : relQueryType,
                description: JSON.stringify(field),
                args:
                  fieldIs.relation(field) && !field.isList
                    ? undefined
                    : argTypes,
                resolve: batch(
                  async (
                    roots: any[],
                    args: Obj,
                    { internal }: { internal?: boolean },
                    resolveInfo: GraphQLResolveInfo,
                  ) => {
                    const rootField = fieldIs.relation(field) ? f : 'id';
                    const relField = fieldIs.relation(field)
                      ? 'id'
                      : field.foreign;

                    if (fieldIs.foreignRelation(field)) {
                      args.sort = args.sort || [];
                    }
                    const records = await getRecords(
                      info,
                      connectors,
                      field,
                      { ...args, start: undefined, end: undefined },
                      resolveInfo,
                      plugins.filter(p => p.onFilter).map(p => p.onFilter!),
                      internal
                        ? []
                        : plugins.filter(p => p.onQuery).map(p => p.onQuery!),
                      {
                        filter: [
                          relField,
                          'in',
                          roots.reduce(
                            (res, root) => res.concat(root[rootField] || []),
                            [],
                          ),
                        ],
                        fields: [relField],
                      },
                    );

                    return roots.map(root => {
                      if (fieldIs.relation(field)) {
                        if (!field.isList) {
                          return records.find(r => r.id === root[f]);
                        }
                        if (!root[f]) return [];
                        if (args.sort) {
                          return records
                            .filter(r => root[f].includes(r.id))
                            .slice(args.start, args.end);
                        }
                        return root[f]
                          .slice(args.start, args.end)
                          .map(id => records.find(r => r.id === id));
                      }
                      return records
                        .filter(
                          r =>
                            Array.isArray(r[relField])
                              ? r[relField].includes(root.id)
                              : r[relField] === root.id,
                        )
                        .slice(args.start, args.end);
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
          fields: keysToObject(
            Object.keys(info.schema[type]).filter(
              f => !fieldIs.foreignRelation(info.schema[type][f]),
            ),
            f => {
              const field = info.schema[type][f] as RelationField | ScalarField;
              if (f === 'id') return { type: new GraphQLNonNull(GraphQLID) };
              const scalar = fieldIs.scalar(field)
                ? scalars[field.scalar]
                : GraphQLID;
              return { type: field.isList ? new GraphQLList(scalar) : scalar };
            },
          ),
        }),
    );

    const graphQLSchema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: keysToObject(typeNames, type => ({
          type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
          args: argTypes,
          async resolve(
            _root: any,
            args: Obj,
            { internal }: { internal?: boolean },
            resolveInfo: GraphQLResolveInfo,
          ) {
            args.sort = args.sort || [];
            return await getRecords(
              info,
              connectors,
              { type, isList: true },
              args,
              resolveInfo,
              plugins.filter(p => p.onFilter).map(p => p.onFilter!),
              internal
                ? []
                : plugins.filter(p => p.onQuery).map(p => p.onQuery!),
            );
          },
        })),
      }),

      mutation: new GraphQLObjectType({
        name: 'Mutation',
        fields: {
          commit: {
            type: new GraphQLObjectType({
              name: 'MutationResult',
              fields: keysToObject(typeNames, type => ({
                type: new GraphQLNonNull(
                  new GraphQLList(new GraphQLNonNull(queryTypes[type])),
                ),
              })),
            }),
            args: keysToObject(typeNames, type => ({
              type: new GraphQLList(new GraphQLNonNull(inputTypes[type])),
            })),
            async resolve(_root, args, context) {
              return commit(
                info,
                connectors,
                args,
                context,
                plugins.filter(p => p.onCommit).map(p => p.onCommit!),
              );
            },
          },
        },
      }),
    });

    const queries = Array.isArray(request) ? request : [request];

    const data: Data = {};
    const newIds: Obj<Obj<string>> = {};
    const results: QueryResponse[] = await Promise.all(
      queries.map(async ({ query, variables, normalize }) => {
        const queryDoc = parse(query);
        const result = await execute(
          graphQLSchema,
          queryDoc,
          null,
          { rootQuery: query, newIds },
          variables,
        );
        if (!normalize || result.errors) return result;
        return normalizeResult(
          info.schema,
          data,
          queryDoc,
          argTypes,
          result.data!,
        );
      }),
    );

    const firstNormalize = queries.findIndex(({ normalize }) => !!normalize);
    if (firstNormalize !== -1) {
      results[firstNormalize].data = data;
      results[firstNormalize].newIds = newIds;
    }
    return Array.isArray(request) ? results : results[0];
  }

  return api;
}
