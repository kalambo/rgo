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
  GraphQLString,
  OperationDefinitionNode,
  parse,
} from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  ForeignRelationField,
  keysToObject,
  mapArray,
  Obj,
  parseArgs,
  parsePlainArgs,
  QueryRequest,
  QueryResponse,
  RelationField,
  scalars,
} from '../core';

import batch from './batch';
import mutate from './mutate';
import { DataType, Mutation } from './typings';

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

export default function buildServer(
  types: Obj<DataType>,
  onMutate?: (mutations: Obj<Mutation[]>) => void | Promise<void>,
) {
  const typeNames = Object.keys(types);

  const typeFields = keysToObject<string, Obj<Field>>(typeNames, type => ({
    id: {
      scalar: 'string',
    },
    createdat: {
      scalar: 'date',
    },
    modifiedat: {
      scalar: 'date',
    },
    ...types[type].fields,
  }));
  const typeConnectors = keysToObject(typeNames, type =>
    types[type].connector(typeFields[type]),
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

                  const auth = types[field.type].auth;
                  const authArgs = auth.query
                    ? await auth.query(userId, queryArgs)
                    : queryArgs;

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
                await typeConnectors[type].findByIds(args.ids),
              );
            } else {
              const queryArgs = parseArgs(args, userId, typeFields[type], info);

              const auth = types[type].auth;
              const authArgs = auth.query
                ? await auth.query(userId, queryArgs)
                : queryArgs;

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
            return mutate(types, typeConnectors, args, context);
          },
        },
      },
    }),
  });

  function server(request: QueryRequest, context?: any): Promise<QueryResponse>;
  function server(
    request: QueryRequest[],
    context?: any,
  ): Promise<QueryResponse[]>;
  async function server(request: QueryRequest | QueryRequest[], context?: any) {
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
            data: JSON.stringify(
              typeFields,
              (_, v) => (typeof v === 'function' ? true : v),
            ),
          };
        }

        const queryDoc = parse(query);
        const { data: result, errors } = await execute(
          schema,
          queryDoc,
          null,
          { ...context, rootQuery: query, mutationsInfo },
          variables,
        );
        if (errors) {
          console.log(errors);
          return {};
        }
        if (!normalize) return { data: result };

        const operationNode = queryDoc
          .definitions[0] as OperationDefinitionNode;
        if (operationNode.operation === 'query') {
          const firstIds: Obj<Obj<string>> = {};
          let idsQuery: boolean = false;

          const processLayer = (
            root: { type?: string; field: string },
            field: ForeignRelationField | RelationField,
            { arguments: argNodes, selectionSet }: FieldNode,
            queryResults: Obj<(Obj | null)[]>,
            path: string,
            variables: Obj,
          ) => {
            const fieldNodes = selectionSet!.selections as FieldNode[];
            const scalarFields = fieldNodes
              .filter(
                ({ name, selectionSet }) =>
                  name.value !== 'id' && !selectionSet,
              )
              .map(node => node.name.value);
            const relationFields = fieldNodes
              .filter(({ selectionSet }) => selectionSet)
              .map(node => node.name.value);
            const args = parsePlainArgs(argNodes, variables);
            if (args.ids) idsQuery = true;

            data[field.type] = data[field.type] || {};
            if (
              !idsQuery &&
              (!root.type ||
                fieldIs.foreignRelation(field) ||
                (field.isList && args.sort))
            ) {
              firstIds[path] = {};
            }
            Object.keys(queryResults).forEach(rootId => {
              if (
                root.type &&
                fieldIs.relation(field) &&
                field.isList &&
                !args.sort
              ) {
                if (data[root.type][rootId]![root.field]) {
                  data[root.type][rootId]![root.field].unshift(args.skip || 0);
                }
              }
              queryResults[rootId].forEach(
                (record, index) =>
                  record &&
                  (idsQuery ||
                    !args.trace ||
                    args.trace.start === undefined ||
                    index < args.trace.start ||
                    args.trace.end === undefined ||
                    index >= args.trace.end) &&
                  (data[field.type][record.id] = {
                    ...data[field.type][record.id] || {},
                    ...keysToObject(scalarFields, f => record[f]),
                    ...keysToObject(
                      relationFields,
                      f =>
                        record[f] && mapArray(record[f], rec => rec && rec.id),
                    ),
                  }),
              );
              if (firstIds[path]) {
                firstIds[path][rootId] = (queryResults[rootId][
                  args.offset || 0
                ] || {}).id;
              }
            });

            fieldNodes
              .filter(({ selectionSet }) => selectionSet)
              .forEach(node =>
                processLayer(
                  { type: field.type, field: node.name.value },
                  typeFields[field.type][node.name.value] as
                    | ForeignRelationField
                    | RelationField,
                  node,
                  Object.keys(queryResults).reduce(
                    (res, rootId) => ({
                      ...res,
                      ...keysToObject(
                        queryResults[rootId].filter(record => record) as Obj[],
                        record =>
                          Array.isArray(record[node.name.value])
                            ? record[node.name.value]
                            : [record[node.name.value]],
                        record => record.id,
                      ),
                    }),
                    {},
                  ),
                  `${path}_${node.name.value}`,
                  variables,
                ),
              );
          };

          const rootNodes = operationNode.selectionSet
            .selections as FieldNode[];
          rootNodes.forEach(node =>
            processLayer(
              { field: node.name.value },
              { type: node.name.value, isList: true },
              node,
              { '': result![node.name.value] || [] },
              node.name.value,
              variables,
            ),
          );
          return idsQuery ? {} : { firstIds };
        } else {
          const rootNodes = (operationNode.selectionSet!
            .selections[0] as FieldNode).selectionSet!
            .selections as FieldNode[];
          for (const node of rootNodes) {
            const type = node.name.value;
            const fieldNodes = node.selectionSet!.selections as FieldNode[];
            const scalarFields = fieldNodes
              .filter(
                ({ name, selectionSet }) =>
                  name.value !== 'id' && !selectionSet,
              )
              .map(node => node.name.value);
            const relationFields = fieldNodes
              .filter(({ selectionSet }) => selectionSet)
              .map(node => node.name.value);

            data[type] = data[type] || {};
            result!.mutate[type].forEach(
              record =>
                record &&
                (data[type][record.id] = {
                  ...data[type][record.id] || {},
                  ...keysToObject(scalarFields, f => record[f]),
                  ...keysToObject(
                    relationFields,
                    f => record[f] && mapArray(record[f], rec => rec && rec.id),
                  ),
                }),
            );
          }
          return {};
        }
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
  return server;
}
