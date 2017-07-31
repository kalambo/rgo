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
  QueryResult,
  RelationField,
  scalars,
} from '../core';

import batch from './batch';
import mutate from './mutate';
import { DataType, QueryConfig } from './typings';

const nullIfEmpty = (array: any[]) => (array.length === 0 ? null : array);

const argTypes = {
  filter: { type: GraphQLString },
  sort: { type: GraphQLString },
  skip: { type: GraphQLInt },
  show: { type: GraphQLInt },
  info: {
    type: new GraphQLInputObjectType({
      name: 'Info',
      fields: {
        extraSkip: { type: GraphQLInt },
        extraShow: { type: GraphQLInt },
        traceSkip: { type: GraphQLInt },
        traceShow: { type: GraphQLInt },
      },
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

                  const results = await types[field.type].connector.query({
                    ...authArgs,
                    skip: 0,
                    show: authArgs.show === 0 ? 0 : null,
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
                            .slice(
                              authArgs.skip,
                              authArgs.show === null
                                ? undefined
                                : authArgs.show,
                            ),
                        );
                      }
                      return root[f]
                        .slice(
                          authArgs.skip,
                          authArgs.show === null ? undefined : authArgs.show,
                        )
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
                        .slice(
                          authArgs.skip,
                          authArgs.show === null ? undefined : authArgs.show,
                        ),
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
                await types[type].connector.findByIds(args.ids),
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
                    authArgs.skip === authArgs.trace.skip
                      ? []
                      : types[type].connector.query({
                          ...authArgs,
                          show: authArgs.trace.skip,
                        }),
                    types[type].connector.query({
                      ...authArgs,
                      skip: authArgs.trace.skip,
                      show: authArgs.trace.show,
                      fields: ['id'],
                    }),
                    authArgs.trace.show === null ||
                    authArgs.show === authArgs.trace.show
                      ? []
                      : types[type].connector.query({
                          ...authArgs,
                          skip: authArgs.trace.show,
                        }),
                  ])).reduce((res, records) => res.concat(records), []),
                );
              }

              return nullIfEmpty(await types[type].connector.query(authArgs));
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
          async resolve(_root, args, context: { userId: string | null }) {
            return mutate(types, args, context);
          },
        },
      },
    }),
  });

  return async (
    configs: QueryConfig[],
    context?: any,
  ): Promise<QueryResult> => {
    if (configs.length === 1 && configs[0].query === '{ SCHEMA }') {
      return JSON.stringify(
        typeFields,
        (_, v) => (typeof v === 'function' ? true : v),
      ) as any;
    }

    const data: Data = {};
    const firstIds = await Promise.all(
      configs.map(async ({ query, variables }) => {
        const firsts: Obj<Obj<string>> = {};
        const queryDoc = parse(query);
        const result = await execute(
          schema,
          queryDoc,
          null,
          { ...context, rootQuery: query },
          variables,
        );

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
              ({ name, selectionSet }) => name.value !== 'id' && !selectionSet,
            )
            .map(node => node.name.value);
          const relationFields = fieldNodes
            .filter(({ selectionSet }) => selectionSet)
            .map(node => node.name.value);
          const args = parsePlainArgs(argNodes, variables);

          data[field.type] = data[field.type] || {};
          if (fieldIs.foreignRelation(field) || (field.isList && args.sort)) {
            firsts[path] = {};
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
                (!args.info ||
                  args.info.traceSkip === null ||
                  index < args.info.traceSkip ||
                  args.info.traceShow === undefined ||
                  index > args.info.traceShow) &&
                (data[field.type][record.id] = {
                  ...data[field.type][record.id],
                  ...keysToObject(scalarFields, f => record[f]),
                  ...keysToObject(
                    relationFields,
                    f => record[f] && mapArray(record[f], rec => rec && rec.id),
                  ),
                }),
            );
            if (firsts[path]) {
              firsts[path][rootId] = (queryResults[rootId][
                args.info ? args.info.extraSkip : 0
              ] || {}).id;
            }
          });

          fieldNodes.filter(({ selectionSet }) => selectionSet).forEach(node =>
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

        const rootNodes = (queryDoc.definitions[0] as OperationDefinitionNode)
          .selectionSet.selections as FieldNode[];
        rootNodes.forEach(node =>
          processLayer(
            { field: node.name.value },
            { type: node.name.value, isList: true },
            node,
            { '': result.data![node.name.value] || [] },
            node.name.value,
            variables,
          ),
        );
        return firsts;
      }),
    );
    return { data, firstIds } as any;
  };
}
