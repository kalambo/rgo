export { Client, ClientPlugin } from './typings';

import * as _ from 'lodash';
import {
  buildClientSchema,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  introspectionQuery,
} from 'graphql';

import {
  encodeDate,
  keysToObject,
  Field,
  fieldIs,
  FieldValue,
  localPrefix,
  mapArray,
  noUndef,
  Obj,
  promisifyEmitter,
  Query,
  QueryRequest,
  QueryResponse,
  standardiseQuery,
} from '../core';

import getRequests from './getRequests';
import readLayer from './readLayer';
import setState from './setState';
import {
  Client,
  ClientPlugin,
  ClientState,
  DataChanges,
  FetchInfo,
} from './typings';

export default function buildClient(
  url: string,
  ...plugins: ClientPlugin[]
): Client {
  const baseFetch = plugins.filter(p => p.onFetch).reduce(
    (res, p) => (body: QueryRequest[], headers: Obj) =>
      p.onFetch!(body, headers, res),
    async (body: QueryRequest[], headers: Obj): Promise<QueryResponse[]> => {
      const response = await fetch(url, {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json',
          ...(headers || {}),
        }),
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error();
      return await response.json();
    },
  );

  let schemaResolve;
  const schemaPromise = new Promise(resolve => (schemaResolve = resolve));
  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };
  const localCounters: Obj<number> = {};

  const queries: Obj<{
    active: Obj<number>;
    relationIndices: Obj<number>;
    latestFetch?: number;
    pending?: {
      requests: string[];
      next: FetchInfo;
    };
    fetched?: FetchInfo;
    firstIds?: Obj<Obj<string>>;
  }> = {};
  const listeners: ((changes: DataChanges, clearKeys: string[]) => void)[] = [];
  let commits: {
    request: string;
    variables: Obj<any[]>;
    resolve: (
      response: { newIds?: Obj<Obj<string>>; errors?: string[] },
    ) => void;
  }[] = [];

  const runQueries = (changes: DataChanges = {}) => {
    const fetchKeys: string[] = [];
    Object.keys(queries).forEach(key => {
      const { requests, next } = getRequests(
        client.schema,
        state,
        {
          ...JSON.parse(key),
          fields: Object.keys(queries[key].active).map(k => {
            const f = JSON.parse(k) as string | Query;
            if (typeof f === 'string') return f;
            return { ...f, alias: `r${queries[key].relationIndices[k]}` };
          }),
        },
        queries[key].fetched,
      );
      if (requests.length === 0) {
        queries[key].fetched = next;
      } else {
        queries[key].pending = { requests, next };
        fetchKeys.push(key);
      }
    });
    listeners.forEach(l => l(changes, fetchKeys));
    if (fetchKeys.length > 0) run();
  };

  const set = (
    data: Obj<Obj<Obj<FieldValue | null | undefined> | null | undefined>>,
    schema?: Obj<Obj<Field>>,
  ) => {
    const { changes, diffChanged } = setState(state, data, schema);
    plugins.forEach(p => {
      if (p.onChange) p.onChange(state, changes);
    });
    if (diffChanged || schema) runQueries(changes);
    else listeners.forEach(l => l(changes, []));
  };

  let fetchCounter: number = 0;
  let resetFetch: number = 0;
  const run = _.throttle(async () => {
    const fetchIndex = ++fetchCounter;
    const requests: QueryRequest[] = [];

    const firstIndicies: Obj<number> = {};
    const runQueries = Object.keys(queries).filter(key => queries[key].pending);
    runQueries.forEach(key => {
      firstIndicies[key] = requests.length;
      queries[key].latestFetch = fetchCounter;
      requests.push(
        ...queries[key].pending!.requests.map(query => ({
          query,
          normalize: true,
        })),
      );
      queries[key].fetched = queries[key].pending!.next;
      delete queries[key].pending;
      delete queries[key].firstIds;
    });

    const commitIndices: number[] = [];
    for (const { request, variables } of commits) {
      commitIndices.push(requests.length);
      requests.push({ query: request, variables, normalize: true });
    }
    const commitResolves = commits.map(c => c.resolve);
    commits = [];

    const responses = await baseFetch(requests, {});
    runQueries.forEach(key => {
      if (queries[key].latestFetch === fetchIndex) {
        queries[key].firstIds = responses[firstIndicies[key]].firstIds!;
      }
    });
    commitResolves.forEach((watcher, i) => {
      const { newIds, errors } = responses[commitIndices[i]];
      watcher({ newIds, errors: errors && errors.map(e => e.message) });
    });
    set(fetchIndex > resetFetch ? responses[0].data : {}, client.schema);
  }, 100);

  const reset = () => {
    resetFetch = fetchCounter;
    Object.keys(queries).forEach(key => {
      queries[key] = {
        active: queries[key].active,
        relationIndices: queries[key].relationIndices,
      };
    });
    set(
      keysToObject(Object.keys(state.server), type =>
        keysToObject(Object.keys(state.server[type]), null),
      ),
      client.schema,
    );
  };

  const client = {
    schema: null as any,
    reset,

    create(type) {
      localCounters[type] = localCounters[type] || 0;
      const id = `${localPrefix}${localCounters[type]++}`;
      set({ [type]: { [id]: {} } });
      return id;
    },

    query(...args) {
      if (args.length === 0) return schemaPromise;

      const baseQueries: Query<string>[] = Array.isArray(args[0])
        ? args[0]
        : [args[0]];
      const onLoad = args[1] as
        | ((data: Obj | { data: Obj; spans: Obj } | null) => void)
        | undefined;

      return promisifyEmitter(innerListener => {
        let queryInfo: ({ key: string; fieldKeys: string[] } | null)[] = [];
        let listener: (changes: DataChanges, clearKeys: string[]) => void;
        schemaPromise.then(() => {
          if (baseQueries.length === 0) {
            innerListener({});
          } else {
            const allQueries = baseQueries.map(q =>
              standardiseQuery(q, client.schema),
            );
            queryInfo = allQueries.map(({ alias: _, fields, ...query }) => {
              if (
                query.filter &&
                query.filter[0] === 'id' &&
                query.filter[query.filter.length - 1].startsWith(localPrefix)
              ) {
                return null;
              }
              const key = JSON.stringify(query);
              queries[key] = queries[key] || {
                active: {},
                relationIndices: {},
              };
              const fieldKeys = fields.map(f => JSON.stringify(f));
              fieldKeys.forEach(f => {
                queries[key].active[f] = (queries[key].active[f] || 0) + 1;
                if (f[0] === '{' && !queries[key].relationIndices[f]) {
                  queries[key].relationIndices[f] =
                    Math.max(
                      0,
                      ...Object.keys(queries[key].relationIndices).map(
                        k => queries[key].relationIndices[k],
                      ),
                    ) + 1;
                }
              });
              return { key, fieldKeys };
            });

            let data: Obj;
            let updaters: ((changes: Obj<Obj<Obj<true>>>) => number)[] | null;
            listener = (changes, clearKeys) => {
              if (
                queryInfo.some(info => !!info && clearKeys.includes(info.key))
              ) {
                updaters = null;
                innerListener(null);
              } else {
                const updateType = updaters
                  ? Math.max(...updaters.map(u => u(changes)))
                  : 2;
                if (updateType === 2) {
                  data = {};
                  updaters = allQueries.map((query, i) => {
                    const { relationIndices, firstIds = {} } = queries[
                      queryInfo[i]!.key
                    ];
                    return readLayer(query, client.schema, {
                      records: { '': { '': data } },
                      state,
                      firstIds: keysToObject(
                        Object.keys(firstIds),
                        pathString => firstIds[pathString],
                        pathString => {
                          const path = pathString.split('_');
                          if (path.length > 1) {
                            const index = parseInt(path[1].slice(1));
                            const fieldKey = queryInfo[i]!.fieldKeys.find(
                              k => relationIndices[k] === index,
                            )!;
                            const f = JSON.parse(fieldKey) as Query;
                            path[1] = f.alias || f.name;
                          }
                          return path.join('_');
                        },
                      ),
                      plugins: plugins
                        .filter(p => p.onFilter)
                        .map(p => p.onFilter!),
                    });
                  });
                }
                if (updateType) innerListener(data);
              }
            };
            listeners.push(listener);
            runQueries();
          }
        });
        return () => {
          queryInfo.forEach(info => {
            if (info) {
              info.fieldKeys.forEach(f => {
                queries[info.key].active[f]--;
                if (queries[info.key].active[f] === 0) {
                  delete queries[info.key].active[f];
                  delete queries[info.key].relationIndices[f];
                }
              });
              if (Object.keys(queries[info.key].active).length === 0) {
                delete queries[info.key];
              }
            }
          });
          const index = listeners.indexOf(listener);
          if (index !== -1) listeners.splice(index, 1);
        };
      }, onLoad) as any;
    },

    set(values) {
      if (values.length !== 0) {
        set(values.reduce((res, v) => _.set(res, v.key, v.value), {}));
      }
    },

    async commit(keys: [string, string, string][]) {
      await schemaPromise;
      if (keys.length === 0) return { values: [], newIds: {} };

      const data = keys.reduce((res, key) => {
        const field = this.schema![key[0]][key[2]];
        const isDate = fieldIs.scalar(field) && field.scalar === 'date';
        const value = noUndef(_.get(state.combined, key));
        return _.set(res, key, isDate ? mapArray(value, encodeDate) : value);
      }, {});
      const types = Object.keys(data);
      const dataArrays = keysToObject(types, type =>
        Object.keys(data[type]).map(id => ({ id, ...data[type][id] })),
      );
      const { newIds, errors } = await new Promise<{
        newIds?: Obj<Obj<string>>;
        errors?: string[];
      }>(resolve => {
        commits.push({
          request: `mutation Mutate(${types
            .map(t => `$${t}: [${t}Input!]`)
            .join(', ')}) {
            commit(${types.map(t => `${t}: $${t}`).join(', ')}) {
              ${types
                .map(
                  t => `${t} {
                    ${Array.from(
                      new Set([
                        ...dataArrays[t].reduce<string[]>(
                          (res, o) => [...res, ...Object.keys(o)],
                          [],
                        ),
                        'createdat',
                        'modifiedat',
                      ]),
                    )
                      .map(
                        f =>
                          fieldIs.scalar(this.schema![t][f])
                            ? f
                            : `${f} { id }`,
                      )
                      .join('\n')}
                  }`,
                )
                .join('\n')}
            }
          }`,
          variables: dataArrays,
          resolve,
        });
        run();
      });

      if (errors) return null;
      set(keys.reduce((res, key) => _.set(res, key, undefined), {}));
      return {
        values: keys.map(([type, id, field]) =>
          noUndef(
            _.get(state.combined, [
              type,
              (newIds![type] && newIds![type][id]) || id,
              field,
            ]),
          ),
        ),
        newIds: newIds!,
      };
    },
  };

  (async () => {
    const schemaFields = buildClientSchema(
      (await (await fetch(url, {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: introspectionQuery }),
      })).json()).data,
    )
      .getQueryType()
      .getFields();
    client.schema = keysToObject(Object.keys(schemaFields), type => {
      const fields = (schemaFields[type].type as GraphQLList<
        GraphQLNonNull<GraphQLObjectType>
      >).ofType.ofType.getFields();
      return keysToObject(Object.keys(fields), field =>
        JSON.parse(fields[field].description),
      );
    });
    schemaResolve();
  })();

  return client;
}
