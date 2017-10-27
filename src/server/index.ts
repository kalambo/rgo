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
  createCompare,
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
  scalars,
} from '../core';

import batch from './batch';
import commit from './commit';
import normalizeResult from './normalize';
import { AuthConfig, Connector, Mutation } from './typings';

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

const mapFilterUserId = (filter: any[] | undefined, userId: string | null) => {
  if (!filter) return filter;
  if (['and', 'or'].includes(filter[0].toLowerCase())) {
    return [filter[0], ...filter.slice(1).map(f => mapFilterUserId(f, userId))];
  }
  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];
  if (value === '$user') return [filter[0], op, userId || ''];
  return filter;
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

    const getRecords = async (
      field: ForeignRelationField | RelationField,
      args: Obj,
      { user, internal }: { user: Obj | null; internal?: boolean },
      info: GraphQLResolveInfo,
      extra?: { filter: any[]; fields: string[] },
    ) => {
      if (args.filter && !Array.isArray(args.filter)) {
        args.filter = ['id', args.filter];
      }
      if (args.sort && !Array.isArray(args.sort)) {
        args.sort = [args.sort];
      }
      if (args.sort) {
        if (!args.sort.some(s => s.replace('-', '') === 'createdat')) {
          args.sort.push('-createdat');
        }
        if (!args.sort.some(s => s.replace('-', '') === 'id')) {
          args.sort.push('id');
        }
      }

      if (extra) {
        args.filter = args.filter
          ? ['and', args.filter, extra.filter]
          : extra.filter;
      }
      args.filter = mapFilterUserId(args.filter, user && user.id);
      args.fields = Array.from(
        new Set([
          'id',
          ...info.fieldNodes[0].selectionSet!.selections
            .map((f: FieldNode) => f.name.value)
            .filter(
              fieldName =>
                !fieldIs.foreignRelation(typeFields[field.type][fieldName]),
            ),
          ...(args.sort || []).map(s => s.replace('-', '')),
          ...(extra ? extra.fields : []),
        ]),
      );

      if (internal || !options.auth) {
        return await typeConnectors[field.type].query(args);
      }

      const limits = await options.auth.limitQuery(
        typeFields,
        runQuery,
        user,
        field.type,
      );
      const limitsMap: Obj<any[][]> = {};
      limits.forEach(({ filter, fields }) => {
        const key = (fields || []).sort().join('-');
        limitsMap[key] = limitsMap[key] || [];
        if (filter) limitsMap[key].push(filter);
      });
      const groupedLimits = Object.keys(limitsMap).map(key => {
        const fields = key
          ? ['id', 'createdat', 'modifiedat', ...key.split('-')]
          : undefined;
        return {
          filter:
            args.filter && limitsMap[key].length > 0
              ? ['and', args.filter, ['or', ...limitsMap[key]]]
              : args.filter || ['or', ...limitsMap[key]],
          fields:
            args.fields && fields
              ? args.fields.filter(f => fields.includes(f))
              : args.fields || fields,
        };
      });

      if (groupedLimits.length === 1) {
        return await typeConnectors[field.type].query({
          ...args,
          ...groupedLimits[0],
        });
      }

      const data: Obj<Obj> = {};
      for (const records of await Promise.all(
        groupedLimits.map(typeConnectors[field.type].query),
      )) {
        records.forEach(r => (data[r.id] = { ...(data[r.id] || {}), ...r }));
      }
      return Object.keys(data)
        .map(id => data[id])
        .sort(createCompare((record, key) => record[key], args.sort))
        .slice(args.start, args.end);
    };

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
                    args: Obj,
                    context: { user: Obj | null; internal?: boolean },
                    info: GraphQLResolveInfo,
                  ) => {
                    const rootField = fieldIs.relation(field) ? f : 'id';
                    const relField = fieldIs.relation(field)
                      ? 'id'
                      : field.foreign;

                    if (fieldIs.foreignRelation(field)) {
                      args.sort = args.sort || [];
                    }
                    const records = await getRecords(
                      field,
                      { ...args, start: undefined, end: undefined },
                      context,
                      info,
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
            args: Obj,
            conext: { user: Obj | null; internal?: boolean },
            info: GraphQLResolveInfo,
          ) {
            args.sort = args.sort || [];
            return await getRecords({ type, isList: true }, args, conext, info);
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

    const printQuery = (
      { name, alias, fields, ...args }: Query,
      field: ForeignRelationField | RelationField,
    ) => {
      const base = `${alias ? `${alias}:` : ''}${name}`;
      const printedArgs =
        fieldIs.foreignRelation(field) || field.isList ? printArgs(args) : '';
      return `${base}${printedArgs} {
        ${fields
          .map(
            f =>
              typeof f === 'string'
                ? fieldIs.scalar(typeFields[field.type][f])
                  ? f
                  : `${f} {\nid\n}`
                : printQuery(f, typeFields[field.type][f.name] as
                    | ForeignRelationField
                    | RelationField),
          )
          .join('\n')}
      }`;
    };
    const runQuery = async (query: Query | Query[]) =>
      (await execute(
        graphQLSchema,
        parse(`{
          ${Array.isArray(query)
            ? query
            : [query]
                .map(q => printQuery(q, { type: q.name, isList: true }))
                .join('\n')}
        }`),
        null,
        {
          user,
          rootQuery: query,
          mutationsInfo: { mutations: {}, newIds: {} },
          internal: true,
        },
      )).data as Obj;

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
