import * as connectors from './connectors';
export { connectors };

import {
  execute,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  GraphQLString,
  parse,
} from 'graphql';
import * as _ from 'lodash';

import {
  Data,
  Field,
  fieldIs,
  keysToObject,
  noUndef,
  Obj,
  parseArgs,
  QueryArgs,
  QueryRequest,
  QueryResponse,
  scalars,
} from '../core';

import batch from './batch';
import mutate from './mutate';
import normalizeResult from './normalize';
import {
  AuthConfig,
  Connector,
  DbField,
  Mutation,
  QueryLimit,
} from './typings';

const argTypes = {
  filter: { type: GraphQLString },
  sort: { type: GraphQLString },
  skip: { type: GraphQLInt },
  show: { type: GraphQLInt },
  offset: { type: GraphQLInt },
  trace: {
    type: new GraphQLInputObjectType({
      name: 'Trace',
      fields: { start: { type: GraphQLInt }, end: { type: GraphQLInt } },
    }),
  },
};

const toDbField = (field: Field): DbField | null => {
  if (fieldIs.foreignRelation(field)) return null;
  return {
    scalar: fieldIs.scalar(field) ? field.scalar : 'string',
    isList: field.isList,
  };
};

const isValidField = (field: any) =>
  (field.scalar && !(field.type || field.foreign)) ||
  (field.type &&
    !(field.scalar || field.rules || (field.isList && field.foreign)));

const getSchema = async (
  connectors: (fields: Obj<DbField>, type?: string) => Connector,
) => {
  const schemaConnector = connectors({
    id: { scalar: 'string' },
    root: { scalar: 'string' },
    name: { scalar: 'string' },
    scalar: { scalar: 'string' },
    isList: { scalar: 'boolean' },
    rules: { scalar: 'json' },
    type: { scalar: 'string' },
    foreign: { scalar: 'string' },
  });
  return {
    connector: schemaConnector,
    fields: (await schemaConnector.dump()).reduce(
      (res, { root, name, ...info }) => ({
        ...res,
        [root]: {
          ...(res[root] || {}),
          [name]: keysToObject(
            Object.keys(info).filter(
              k => info[k] !== undefined && info[k] !== null,
            ),
            k => info[k],
          ),
        },
      }),
      {},
    ) as Obj<Obj<{ id: string } & Field>>,
  };
};

const applyQueryLimit = (queryArgs: QueryArgs, limit: QueryLimit) => {
  if (limit === false) return true;
  if (!limit) {
    queryArgs.end = queryArgs.start;
  } else {
    if (limit.filter) {
      queryArgs.filter = {
        $and: [queryArgs.filter, limit.filter],
      };
    }
    if (limit.fields) {
      queryArgs.fields = queryArgs.fields!.filter(f =>
        limit.fields!.includes(f),
      );
    }
  }
};

export default async function buildServer(
  connectors: (fields: Obj<DbField>, type?: string) => Connector,
  alterSchema: (
    type: string,
    field?: string | null,
    info?: DbField | null,
  ) => void | Promise<void>,
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
    const schema = await getSchema(connectors);
    const typeNames = Object.keys(schema.fields);

    if (typeNames.length === 0) {
      return Array.isArray(request) ? request.map(() => ({})) : {};
    }

    const typeFields = keysToObject<string, Obj<Field>>(typeNames, type => ({
      id: { scalar: 'string' },
      createdat: { scalar: 'date' },
      modifiedat: { scalar: 'date' },
      ...keysToObject(Object.keys(schema.fields[type]), fieldName => {
        const { id, ...field } = schema.fields[type][fieldName];
        return field;
      }),
    }));
    const typeConnectors = keysToObject(typeNames, type =>
      connectors(
        keysToObject(
          Object.keys(typeFields[type]).filter(key =>
            toDbField(typeFields[type][key]),
          ),
          key => toDbField(typeFields[type][key])!,
        ),
        type,
      ),
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
                args:
                  fieldIs.relation(field) && !field.isList
                    ? undefined
                    : argTypes,
                resolve: batch(
                  async (
                    roots: any[],
                    args,
                    { user }: { user: Obj | null },
                    info: GraphQLResolveInfo,
                  ) => {
                    const rootField = fieldIs.relation(field) ? f : 'id';
                    const relField = fieldIs.relation(field)
                      ? 'id'
                      : field.foreign;

                    const queryArgs = parseArgs(
                      args,
                      user && user.id,
                      typeFields[field.type],
                      info,
                    );
                    queryArgs.fields = Array.from(
                      new Set([relField, ...(queryArgs.fields || [])]),
                    );
                    queryArgs.filter = {
                      ...queryArgs.filter,
                      [relField]: {
                        $in: roots.reduce(
                          (res, root) => res.concat(root[rootField]),
                          [],
                        ),
                      },
                    };
                    if (options.auth) {
                      if (
                        applyQueryLimit(
                          queryArgs,
                          await options.auth.limitQuery(user, type),
                        )
                      ) {
                        const error = new Error('Not authorized') as any;
                        error.status = 401;
                        return error;
                      }
                    }

                    const results = await typeConnectors[field.type].query({
                      ...queryArgs,
                      start: 0,
                      end: queryArgs.start === queryArgs.end ? 0 : undefined,
                    });

                    return roots.map(root => {
                      if (fieldIs.relation(field)) {
                        if (!root[f]) return null;
                        if (!field.isList) {
                          return results.find(r => r.id === root[f]);
                        }
                        if (args.sort) {
                          return results
                            .filter(r => root[f].includes(r.id))
                            .slice(queryArgs.start, queryArgs.end);
                        }
                        return root[f]
                          .slice(queryArgs.start, queryArgs.end)
                          .map(id => results.find(r => r.id === id));
                      }
                      return results
                        .filter(
                          r =>
                            Array.isArray(r[relField])
                              ? r[relField].includes(root.id)
                              : r[relField] === root.id,
                        )
                        .slice(queryArgs.start, queryArgs.end);
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
        fields: {
          SCHEMA: {
            type: new GraphQLNonNull(scalars.json.type),
            resolve: () => {
              if (!options.auth) return typeFields;
              const result = _.cloneDeep(typeFields);
              (result[options.auth.type][
                options.auth.usernameField
              ] as any).scalar =
                'auth';
              return result;
            },
          },
          ...keysToObject(typeNames, type => ({
            type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
            args: {
              ids: {
                type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
              },
              ...argTypes,
            },
            async resolve(
              _root: any,
              args,
              { user }: { user: Obj | null },
              info: GraphQLResolveInfo,
            ) {
              const queryArgs = args.ids
                ? { filter: { id: { $in: args.ids } }, sort: [], start: 0 }
                : parseArgs(args, user && user.id, typeFields[type], info);
              if (options.auth) {
                if (
                  applyQueryLimit(
                    queryArgs,
                    await options.auth.limitQuery(user, type),
                  )
                ) {
                  const error = new Error('Not authorized') as any;
                  error.status = 401;
                  return error;
                }
              }

              if (queryArgs.trace) {
                return (await Promise.all([
                  queryArgs.start === queryArgs.trace.start
                    ? []
                    : typeConnectors[type].query({
                        ...queryArgs,
                        end: queryArgs.trace.start,
                      }),
                  typeConnectors[type].query({
                    ...queryArgs,
                    start: queryArgs.trace.start,
                    end: queryArgs.trace.end,
                    fields: ['id'],
                  }),
                  queryArgs.trace.end === undefined ||
                  (queryArgs.end !== undefined &&
                    queryArgs.end === queryArgs.trace.end)
                    ? []
                    : typeConnectors[type].query({
                        ...queryArgs,
                        start: queryArgs.trace.end,
                      }),
                ])).reduce((res, records) => res.concat(records), []);
              }

              return await typeConnectors[type].query(queryArgs);
            },
          })),
        },
      }),

      mutation: new GraphQLObjectType({
        name: 'Mutation',
        fields: {
          mutate: {
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
              return mutate(
                typeFields,
                typeConnectors,
                args,
                context,
                options.auth,
              );
            },
          },
          schema: {
            type: new GraphQLNonNull(GraphQLString),
            args: {
              type: { type: new GraphQLNonNull(GraphQLString) },
              field: { type: new GraphQLNonNull(GraphQLString) },
              info: {
                type: new GraphQLInputObjectType({
                  name: 'FieldInfo',
                  fields: {
                    scalar: { type: GraphQLString },
                    isList: { type: GraphQLBoolean },
                    rules: {
                      type: new GraphQLInputObjectType({
                        name: 'FieldRules',
                        fields: {
                          equals: { type: scalars.json.type },
                          email: { type: GraphQLBoolean },
                          url: { type: GraphQLBoolean },
                          transform: { type: GraphQLString },
                          maxWords: { type: GraphQLInt },
                          minChoices: { type: GraphQLInt },
                          maxChoices: { type: GraphQLInt },
                          lt: { type: GraphQLString },
                          gt: { type: GraphQLString },
                          options: { type: new GraphQLList(scalars.json.type) },
                        },
                      }),
                    },
                    type: { type: GraphQLString },
                    foreign: { type: GraphQLString },
                  },
                }),
              },
            },
            async resolve(_, { type, field, info }, { user }) {
              if (options.auth && !options.auth.allowAlter(user)) {
                throw new Error('Not authorized');
              }

              const t = type.toLowerCase();
              const f = field.toLowerCase();

              if (!info) {
                if (!(schema.fields[t] && schema.fields[t][f])) {
                  throw new Error('No field to delete');
                }
                await schema.connector.delete(schema.fields[t][f].id);
                delete schema.fields[t][f];
                if (Object.keys(schema.fields[t]).length === 0) {
                  delete schema.fields[t];
                  await alterSchema(t, null);
                } else {
                  await alterSchema(t, f, null);
                }
                return 'Field successfully deleted';
              }

              if (
                (info.scalar &&
                  ![
                    'boolean',
                    'int',
                    'float',
                    'string',
                    'date',
                    'file',
                    'json',
                  ].includes(info.scalar)) ||
                (info.type && !Object.keys(schema.fields).includes(info.type))
              ) {
                throw new Error('Invalid field info');
              }
              if (info.isList === false) info.isList = null;
              if (info.rules) {
                Object.keys(info.rules).forEach(k => {
                  if (
                    k !== 'equals' &&
                    (info.rules[k] === false ||
                      info.rules[k] === '' ||
                      (Array.isArray(info.rules[k]) &&
                        info.rules[k].length === 0))
                  ) {
                    info.rules[k] = null;
                  }
                });
              }

              if (!schema.fields[t] || !schema.fields[t][f]) {
                if (!isValidField(info)) {
                  throw new Error('Invalid field info');
                }
                const id = schema.connector.newId();
                try {
                  await schema.connector.insert(id, {
                    root: t,
                    name: f,
                    ...info,
                  });
                } catch {
                  throw new Error('Error creating field');
                }
                if (!schema.fields[t]) {
                  schema.fields[t] = {};
                  await alterSchema(t);
                }
                schema.fields[t][f] = { id, ...info };
                const dbField = toDbField(info);
                if (dbField) await alterSchema(t, f, dbField);
                return 'Field successfully created';
              }

              ['scalar', 'isList', 'type', 'foreign'].forEach(key => {
                if (
                  info[key] !== undefined &&
                  info[key] !== noUndef(schema.fields[t][f][key])
                ) {
                  throw new Error(`Cannot change "${key}"`);
                }
              });
              const newInfo = {
                ...schema.fields[t][f],
                ...info,
                rules: (info as any).rules && {
                  ...((schema.fields[t][f] as any).rules || {}),
                  ...((info as any).rules || {}),
                },
              };
              delete newInfo.id;
              newInfo.rules = keysToObject(
                Object.keys(newInfo.rules || {}).filter(
                  k =>
                    newInfo.rules[k] !== null && newInfo.rules[k] !== undefined,
                ),
                k => newInfo.rules[k],
              );
              if (Object.keys(newInfo.rules).length === 0) newInfo.rules = null;
              if (!isValidField(newInfo)) {
                throw new Error('Invalid field info');
              }
              try {
                await schema.connector.update(schema.fields[t][f].id, newInfo);
              } catch {
                throw new Error('Error modifying field');
              }

              return 'Field successfully altered';
            },
          },
        },
      }),
    });

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
          variables,
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
