import * as connectors from './connectors';
export { connectors };

import {
  execute,
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
import * as ajv from 'ajv';

import {
  Data,
  Field,
  fieldIs,
  ForeignRelationField,
  keysToObject,
  noUndef,
  Obj,
  parseArgs,
  QueryRequest,
  QueryResponse,
  RelationField,
  ScalarField,
  scalars,
} from '../core';

((x => x) as any) as ForeignRelationField | RelationField | ScalarField;

import batch from './batch';
import mutate from './mutate';
import normalizeResult from './normalize';
import { Connector, DbField, Mutation } from './typings';

const nullIfEmpty = (array: any[]) => (array.length === 0 ? null : array);

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
  if (schemaConnector.sync) await schemaConnector.sync();
  return {
    connector: schemaConnector,
    fields: (await schemaConnector.dump()).reduce(
      (res, { root, name, ...info }) => ({
        ...res,
        [root]: {
          ...res[root] || {},
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

export default async function buildServer(
  connectors: (fields: Obj<DbField>, type?: string) => Connector,
  alterSchema: (
    type: string,
    field?: string | null,
    info?: DbField | null,
  ) => void | Promise<void>,
  onMutate?: (mutations: Obj<Mutation[]>) => void | Promise<void>,
) {
  async function api(
    request: QueryRequest,
    context?: any,
  ): Promise<QueryResponse>;
  async function api(
    request: QueryRequest[],
    context?: any,
  ): Promise<QueryResponse[]>;
  async function api(request: QueryRequest | QueryRequest[], context?: any) {
    const schema = await getSchema(connectors);
    const typeNames = Object.keys(schema.fields);

    if (typeNames.length === 0) {
      return async (request: QueryRequest | QueryRequest[], context?: any) => {
        ((...x) => x)(context);
        return Array.isArray(request) ? request.map(() => ({})) : {};
      };
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
                  type: field.isList ? new GraphQLList(scalar) : scalar,
                };
              }

              const relQueryType = queryTypes[field.type];
              return {
                type:
                  fieldIs.foreignRelation(field) || field.isList
                    ? new GraphQLList(relQueryType)
                    : relQueryType,
                args:
                  fieldIs.relation(field) && !field.isList
                    ? undefined
                    : argTypes,
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

                    const authArgs = queryArgs;
                    // const auth = types[field.type].auth;
                    // const authArgs = auth.query
                    //   ? await auth.query(userId, queryArgs)
                    //   : queryArgs;

                    const results = await typeConnectors[field.type].query({
                      ...authArgs,
                      start: 0,
                      end: authArgs.start === authArgs.end ? 0 : undefined,
                    });

                    return roots.map(root => {
                      if (fieldIs.relation(field)) {
                        if (!root[f]) return null;
                        if (!field.isList) {
                          return results.find(r => r.id === root[f]);
                        }
                        if (args.sort) {
                          return nullIfEmpty(
                            results
                              .filter(r => root[f].includes(r.id))
                              .slice(authArgs.start, authArgs.end),
                          );
                        }
                        return root[f]
                          .slice(authArgs.start, authArgs.end)
                          .map(id => results.find(r => r.id === id));
                      }
                      return nullIfEmpty(
                        results
                          .filter(
                            r =>
                              Array.isArray(r[relField])
                                ? r[relField].includes(root.id)
                                : r[relField] === root.id,
                          )
                          .slice(authArgs.start, authArgs.end),
                      );
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
              { userId }: { userId: string | null },
              info: GraphQLResolveInfo,
            ) {
              if (args.ids) {
                return nullIfEmpty(
                  await typeConnectors[type].findByIds(args.ids),
                );
              } else {
                const queryArgs = parseArgs(
                  args,
                  userId,
                  typeFields[type],
                  info,
                );

                const authArgs = queryArgs;
                // const auth = types[type].auth;
                // const authArgs = auth.query
                //   ? await auth.query(userId, queryArgs)
                //   : queryArgs;

                if (authArgs.trace) {
                  return nullIfEmpty(
                    (await Promise.all([
                      authArgs.start === authArgs.trace.start
                        ? []
                        : typeConnectors[type].query({
                            ...authArgs,
                            end: authArgs.trace.start,
                          }),
                      typeConnectors[type].query({
                        ...authArgs,
                        start: authArgs.trace.start,
                        end: authArgs.trace.end,
                        fields: ['id'],
                      }),
                      authArgs.trace.end === undefined ||
                      (authArgs.end !== undefined &&
                        authArgs.end === authArgs.trace.end)
                        ? []
                        : typeConnectors[type].query({
                            ...authArgs,
                            start: authArgs.trace.end,
                          }),
                    ])).reduce((res, records) => res.concat(records), []),
                  );
                }

                return nullIfEmpty(await typeConnectors[type].query(authArgs));
              }
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
                type: new GraphQLList(new GraphQLNonNull(queryTypes[type])),
              })),
            }),
            args: keysToObject(typeNames, type => ({
              type: new GraphQLList(new GraphQLNonNull(inputTypes[type])),
            })),
            async resolve(_root, args, context) {
              return mutate(typeFields, typeConnectors, args, context);
            },
          },
        },
      }),
    });

    const queries = Array.isArray(request) ? request : [request];

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
        if (query === '{ SCHEMA }') {
          return {
            data: JSON.stringify(typeFields),
          };
        }

        const queryDoc = parse(query);
        const { data: result, errors } = await execute(
          graphQLSchema,
          queryDoc,
          null,
          { ...context, rootQuery: query, mutationsInfo },
          variables,
        );
        if (errors) {
          console.log(errors);
          return {};
        }
        return normalize
          ? normalizeResult(typeFields, data, queryDoc, variables, result!)
          : { data: result };
      }),
    );

    if (onMutate && Object.keys(mutationsInfo.mutations).length > 0) {
      await onMutate(mutationsInfo.mutations);
    }
    const firstNormalize = queries.findIndex(({ normalize }) => !!normalize);
    if (firstNormalize !== -1) {
      results[firstNormalize].data = data;
      results[firstNormalize].newIds = mutationsInfo.newIds;
    }
    return Array.isArray(request) ? results : results[0];
  }

  const alter = async (type: string, field: string, info: Field | null) => {
    const schema = await getSchema(connectors);

    const validator = new ajv().compile({
      type: 'object',
      properties: {
        scalar: {
          enum: [
            null,
            'boolean',
            'int',
            'float',
            'string',
            'date',
            'file',
            'json',
          ],
        },
        isList: { enum: [null, true] },
        rules: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              properties: {
                equals: {},
                email: { enum: [true] },
                url: { enum: [true] },
                maxWords: { type: 'integer' },
                minChoices: { type: 'integer' },
                maxChoices: { type: 'integer' },
                lt: { type: 'string' },
                gt: { type: 'string' },
                options: { type: 'array' },
              },
              minProperties: 1,
              additionalProperties: false,
            },
          ],
        },
        type: { enum: [null, ...Object.keys(schema.fields)] },
        foreign: { type: ['null', 'string'] },
      },
      additionalProperties: false,
    });
    const isValidField = (field: any) =>
      validator(field) &&
      ((field.scalar && !(field.type || field.foreign)) ||
        (field.type &&
          !(field.scalar || field.rules || (field.isList && field.foreign))));

    if (info) {
      if (schema.fields[type] && schema.fields[type][field]) {
        ['scalar', 'isList', 'type', 'foreign'].forEach(key => {
          if (
            info[key] !== undefined &&
            info[key] !== noUndef(schema.fields[type][field][key])
          ) {
            throw new Error(`Cannot change "${key}"`);
          }
        });
        const newInfo = {
          ...schema.fields[type][field],
          ...info,
          rules: (info as any).rules && {
            ...(schema.fields[type][field] as any).rules || {},
            ...(info as any).rules || {},
          },
        };
        delete newInfo.id;
        newInfo.rules = keysToObject(
          Object.keys(newInfo.rules || {}).filter(
            k => newInfo.rules[k] !== null && newInfo.rules[k] !== undefined,
          ),
          k => newInfo.rules[k],
        );
        if (Object.keys(newInfo.rules).length === 0) newInfo.rules = null;
        if (!isValidField(newInfo)) {
          throw new Error('Invalid field info');
        }
        try {
          await schema.connector.update(schema.fields[type][field].id, newInfo);
        } catch {
          throw new Error('Error modifying field');
        }
      } else {
        if (!isValidField(info)) {
          throw new Error('Invalid field info');
        }
        const id = schema.connector.newId();
        try {
          await schema.connector.insert(id, {
            root: type,
            name: field,
            ...info,
          });
        } catch {
          throw new Error('Error creating field');
        }
        if (!schema.fields[type]) {
          schema.fields[type] = {};
          await alterSchema(type);
        }
        schema.fields[type][field] = { id, ...info };
        const dbField = toDbField(info);
        if (dbField) await alterSchema(type, field, dbField);
      }
    } else {
      if (!(schema.fields[type] && schema.fields[type][field])) {
        throw new Error('No field to delete');
      }
      await schema.connector.delete(schema.fields[type][field].id);
      delete schema.fields[type][field];
      if (Object.keys(schema.fields[type]).length === 0) {
        delete schema.fields[type];
        await alterSchema(type, null);
      } else {
        await alterSchema(type, field, null);
      }
    }
  };

  return { api, alter };
}
