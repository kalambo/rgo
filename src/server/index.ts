import * as connectors from './connectors';
export { connectors };

import {
  execute,
  FieldNode,
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  parse,
} from 'graphql';

import {
  Args,
  Data,
  Field,
  fieldIs,
  keysToObject,
  Obj,
  parseArgs,
  QueryRequest,
  QueryResponse,
  scalars,
} from '../core';

import batch from './batch';
import commit from './commit';
import normalizeResult from './normalize';
import { AuthConfig, Connector, Mutation, QueryLimit } from './typings';

const argTypes = {
  filter: { type: scalars.json.type },
  sort: { type: scalars.json.type },
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

const getSelectionFields = (fields: Obj<Field>, info: GraphQLResolveInfo) =>
  info.fieldNodes[0].selectionSet!.selections
    .map((f: FieldNode) => f.name.value)
    .filter(fieldName => !fieldIs.foreignRelation(fields[fieldName]));

const applyQueryLimit = (args: Args, limit: QueryLimit) => {
  if (limit === false) return true;
  if (!limit) {
    args.end = args.start;
  } else {
    if (limit.filter) {
      args.filter = args.filter
        ? ['AND', [args.filter, limit.filter]]
        : limit.filter;
    }
    if (limit.fields) {
      args.fields = args.fields!.filter(f => limit.fields!.includes(f));
      args.fields = Array.from(new Set([...args.fields, 'id', 'createdat']));
    }
  }
};

export default async function buildServer(
  schema: Obj<{ fields: Obj<Field>; connector: Connector }>,
  options: {
    auth?: AuthConfig;
    onMutate?: (mutations: Obj<Mutation[]>) => void | Promise<void>;
  } = {},
) {
  async function api(
    request: QueryRequest,
    authHeader?: string,
  ): Promise<QueryResponse>;
  async function api(
    request: QueryRequest[],
    authHeader?: string,
  ): Promise<QueryResponse[]>;
  async function api(
    request: QueryRequest | QueryRequest[],
    authHeader?: string,
  ) {
    const typeNames = Object.keys(schema);
    const typeFields = keysToObject<Obj<Field>>(typeNames, type => ({
      id: { scalar: 'string' },
      createdat: { scalar: 'date' },
      modifiedat: { scalar: 'date' },
      ...schema[type].fields,
    }));
    const typeConnectors = keysToObject<Connector>(
      typeNames,
      type => schema[type].connector,
    );

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
                return {
                  type: field.isList
                    ? new GraphQLNonNull(new GraphQLList(scalar))
                    : scalar,
                  description: JSON.stringify(
                    options.auth &&
                    type === options.auth.type &&
                    f === options.auth.usernameField
                      ? { ...field, scalar: 'auth' }
                      : field,
                  ),
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
                    plainArgs,
                    {
                      user,
                      internal,
                    }: { user: Obj | null; internal?: boolean },
                    info: GraphQLResolveInfo,
                  ) => {
                    const rootField = fieldIs.relation(field) ? f : 'id';
                    const relField = fieldIs.relation(field)
                      ? 'id'
                      : field.foreign;

                    const args = parseArgs(
                      plainArgs,
                      user && user.id,
                      typeFields[field.type],
                      fieldIs.relation(field),
                    );
                    args.fields = Array.from(
                      new Set([
                        relField,
                        ...getSelectionFields(typeFields[field.type], info),
                      ]),
                    );
                    const relFilter = [
                      relField,
                      'in',
                      roots.reduce(
                        (res, root) => res.concat(root[rootField] || []),
                        [],
                      ),
                    ];
                    args.filter = args.filter
                      ? ['AND', [args.filter, relFilter]]
                      : relFilter;
                    if (options.auth && !internal) {
                      if (
                        applyQueryLimit(
                          args,
                          await options.auth.limitQuery(
                            typeFields,
                            runQuery,
                            user,
                            field.type,
                          ),
                        )
                      ) {
                        const error = new Error('Not authorized') as any;
                        error.status = 401;
                        return error;
                      }
                    }

                    const results =
                      (args.start || 0) === args.end
                        ? []
                        : await typeConnectors[field.type].query({
                            ...args,
                            start: undefined,
                            end: undefined,
                          });

                    return roots.map(root => {
                      if (fieldIs.relation(field)) {
                        if (!field.isList) {
                          return results.find(r => r.id === root[f]);
                        }
                        if (!root[f]) return [];
                        if (args.sort) {
                          return results
                            .filter(r => root[f].includes(r.id))
                            .slice(args.start, args.end);
                        }
                        return root[f]
                          .slice(args.start, args.end)
                          .map(id => results.find(r => r.id === id));
                      }
                      return results
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
          fields: keysToObject(Object.keys(typeFields[type]), f => {
            const field = typeFields[type][f];

            if (fieldIs.scalar(field)) {
              const scalar =
                f === 'id'
                  ? new GraphQLNonNull(GraphQLID)
                  : scalars[field.scalar].type;
              return {
                type: field.isList ? new GraphQLList(scalar) : scalar,
              };
            }

            if (fieldIs.relation(field)) {
              return {
                type: field.isList ? new GraphQLList(GraphQLID) : GraphQLID,
              };
            }
          }),
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
            plainArgs,
            { user, internal }: { user: Obj | null; internal?: boolean },
            info: GraphQLResolveInfo,
          ) {
            const args = parseArgs(
              plainArgs,
              user && user.id,
              typeFields[type],
            );
            args.fields = getSelectionFields(typeFields[type], info);
            if (options.auth && !internal) {
              if (
                applyQueryLimit(
                  args,
                  await options.auth.limitQuery(
                    typeFields,
                    runQuery,
                    user,
                    type,
                  ),
                )
              ) {
                const error = new Error('Not authorized') as any;
                error.status = 401;
                return error;
              }
            }

            if (args.trace) {
              return (await Promise.all([
                (args.start || 0) === args.trace.start
                  ? []
                  : typeConnectors[type].query({
                      ...args,
                      end: args.trace.start,
                    }),
                typeConnectors[type].query({
                  ...args,
                  start: args.trace.start,
                  end: args.trace.end,
                  fields: ['id'],
                }),
                args.trace.end === undefined ||
                (args.end !== undefined && args.end === args.trace.end)
                  ? []
                  : typeConnectors[type].query({
                      ...args,
                      start: args.trace.end,
                    }),
              ])).reduce((res, records) => res.concat(records), []);
            }

            return await typeConnectors[type].query(args);
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
                typeFields,
                typeConnectors,
                runQuery,
                args,
                context,
                options.auth,
              );
            },
          },
        },
      }),
    });

    const runQuery = async (query: string) =>
      (await execute(graphQLSchema, parse(query), null, {
        user,
        rootQuery: query,
        mutationsInfo: { mutations: {}, newIds: {} },
        internal: true,
      })).data as Obj;

    const queries = Array.isArray(request) ? request : [request];

    let user: Obj | null = null;
    if (options.auth && authHeader && authHeader.split(' ')[0] === 'Bearer') {
      const userId = await options.auth.getUserId(authHeader.split(' ')[1]);
      if (userId) {
        user = {
          id: userId,
          ...((typeConnectors[options.auth.type] &&
            (await typeConnectors[options.auth.type].findById(userId))) ||
            {}),
        };
      } else {
        throw new Error('Not authorized');
      }
    }

    const data: Data = {};
    const mutationsInfo: {
      mutations: Obj<Mutation[]>;
      newIds: Obj<Obj<string>>;
    } = {
      mutations: {},
      newIds: {},
    };
    const results: QueryResponse[] = await Promise.all(
      queries.map(async ({ query, variables, normalize }) => {
        const queryDoc = parse(query);
        const result = await execute(
          graphQLSchema,
          queryDoc,
          null,
          { user, rootQuery: query, mutationsInfo },
          variables,
        );
        if (!normalize || result.errors) return result;
        return normalizeResult(
          typeFields,
          data,
          queryDoc,
          argTypes,
          result.data!,
        );
      }),
    );

    if (options.onMutate && Object.keys(mutationsInfo.mutations).length > 0) {
      await options.onMutate(mutationsInfo.mutations);
    }
    const firstNormalize = queries.findIndex(({ normalize }) => !!normalize);
    if (firstNormalize !== -1) {
      results[firstNormalize].data = data;
      results[firstNormalize].newIds = mutationsInfo.newIds;
    }
    return Array.isArray(request) ? results : results[0];
  }

  return api;
}
