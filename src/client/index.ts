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
import { Client, ClientPlugin, ClientState, QueryInfo } from './typings';

export default function buildClient(
  url: string,
  ...plugins: ClientPlugin[]
): Client {
  const doFetch = plugins.filter(p => p.onFetch).reduce(
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

  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };
  let schemaResolve;
  const schemaPromise = new Promise(resolve => (schemaResolve = resolve));
  const localCounters: Obj<number> = {};

  const queries: QueryInfo[] = [];
  let commits: {
    request: string;
    variables: Obj<any[]>;
    resolve: (
      response: { newIds?: Obj<Obj<string>>; errors?: string[] },
    ) => void;
  }[] = [];

  const set = (
    data: Obj<Obj<Obj<FieldValue | null | undefined> | null | undefined>>,
    schema?: Obj<Obj<Field>>,
  ) => {
    const changes = setState(state, data, schema);
    plugins.forEach(p => {
      if (p.onChange) p.onChange(state, changes);
    });
    queries.forEach(q => q.onChange(changes));
  };

  let runCounter: number = 0;
  let resetRun: number = 0;
  const run = _.throttle(async () => {
    const runIndex = ++runCounter;
    const requests: QueryRequest[] = [];

    const runQueries = queries.filter(q => q.pending);
    const firstIndicies: Obj<number> = {};
    runQueries.forEach((q, i) => {
      firstIndicies[i] = requests.length;
      requests.push(
        ...q.pending!.requests.map(r => ({ query: r, normalize: true })),
      );
      q.latestRun = runIndex;
      q.fetched = q.pending!.next;
      delete q.pending;
      delete q.firstIds;
    });
    const commitIndices: number[] = [];
    for (const { request, variables } of commits) {
      commitIndices.push(requests.length);
      requests.push({ query: request, variables, normalize: true });
    }
    const commitResolves = commits.map(c => c.resolve);
    commits = [];

    const responses = await doFetch(requests, {});
    runQueries.forEach((q, i) => {
      if (q.latestRun === runIndex) {
        q.firstIds = responses[firstIndicies[i]].firstIds!;
      }
    });
    commitResolves.forEach((watcher, i) => {
      const { newIds, errors } = responses[commitIndices[i]];
      watcher({ newIds, errors: errors && errors.map(e => e.message) });
    });
    set(runIndex > resetRun ? responses[0].data : {}, client.schema);
  }, 100);

  const reset = () => {
    resetRun = runCounter;
    queries.forEach(q => {
      q.fetched = {};
      delete q.pending;
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
        let queryInfo: QueryInfo;
        schemaPromise.then(() => {
          if (baseQueries.length === 0) {
            innerListener({});
          } else {
            const allQueries = baseQueries.map(q =>
              standardiseQuery(q, client.schema),
            );
            const serverQueries = allQueries.filter(
              q =>
                !(
                  q.filter &&
                  q.filter[0] === 'id' &&
                  q.filter[q.filter.length - 1].startsWith(localPrefix)
                ),
            );

            let data: Obj;
            let updaters: ((changes: Obj<Obj<Obj<true>>>) => number)[] | null;
            const buildQuery = () => {
              const pending = getRequests(
                client.schema,
                state,
                serverQueries,
                queryInfo.fetched || {},
              );
              if (pending.requests.length === 0) {
                queryInfo.fetched = pending.next;
                data = {};
                updaters = allQueries.map(q =>
                  readLayer(q, client.schema, {
                    records: { '': { '': data } },
                    state,
                    firstIds: queryInfo.firstIds!,
                    plugins: plugins
                      .filter(p => p.onFilter)
                      .map(p => p.onFilter!),
                  }),
                );
                innerListener(data);
              } else {
                queryInfo.pending = pending;
                updaters = null;
                innerListener(null);
                run();
              }
            };
            queryInfo = {
              onChange: changes => {
                if (queryInfo.firstIds) {
                  const updateType = updaters
                    ? Math.max(...updaters.map(u => u(changes)))
                    : 2;
                  if (updateType === 2) buildQuery();
                  else if (updateType === 1) innerListener(data);
                }
              },
              firstIds: {},
            };
            queries.push(queryInfo);
            buildQuery();
          }
        });
        return () => {
          const index = queries.indexOf(queryInfo);
          if (index !== -1) queries.splice(index, 1);
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
