export { Client } from './typings';

import * as _ from 'lodash';
import {
  buildClientSchema,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  introspectionQuery,
} from 'graphql';

import {
  Data,
  keysToObject,
  fieldIs,
  mapArray,
  noUndef,
  Obj,
  promisifyEmitter,
  Query,
  QueryRequest,
  QueryResponse,
  scalars,
  standardiseQuery,
} from '../core';

import ClientState from './ClientState';
import getRequests from './getRequests';
import readLayer from './readLayer';
import { AuthState, Client, QueryInfo } from './typings';

export default function buildClient(
  url: string,
  authRefresh?: (
    refreshToken: string,
  ) => Promise<{ token: string; refresh: string } | null>,
  log?: boolean,
): Client {
  const auth: {
    refresh: (
      refreshToken: string,
    ) => Promise<{ token: string; refresh: string } | null>;
    state: AuthState | null;
    field?: { type: string; field: string };
  } | null = authRefresh
    ? {
        refresh: authRefresh,
        state: JSON.parse(
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('kalamboAuth')) ||
            'null',
        ),
      }
    : null;
  const doFetchBase = async (
    body: QueryRequest[],
  ): Promise<QueryResponse[]> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...auth && auth.state
          ? { Authorization: `Bearer ${auth.state.token}` }
          : {},
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  };
  const doFetch = async (body: QueryRequest[]): Promise<QueryResponse[]> => {
    try {
      return await doFetchBase(body);
    } catch {
      let refreshed = false;
      if (auth && auth.refresh && auth.state && auth.state.refresh) {
        const newTokens = await auth.refresh(auth.state.refresh);
        if (newTokens) {
          setAuth({ ...auth.state, ...newTokens });
          refreshed = true;
        }
      }
      if (auth && !refreshed) setAuth(null);
      return await doFetch(body);
    }
  };

  const state = new ClientState(log);
  const newIds: Obj<number> = {};
  let schemaResolve;
  const schemaPromise = new Promise(resolve => (schemaResolve = resolve));

  let queryCounter = 0;
  const activeQueries: Obj<QueryInfo> = {};
  let commits: {
    request: string;
    variables: Obj<any[]>;
    resolve: (
      response: { newIds?: Obj<Obj<string>>; errors?: string[] },
    ) => void;
  }[] = [];

  let currentRun: number = 0;
  let resetRun: number = 0;
  const run = _.throttle(async () => {
    const runIndex = ++currentRun;
    const requests: QueryRequest[] = [];

    const queryIndices = Object.keys(activeQueries)
      .filter(k => activeQueries[k].pending)
      .map(k => parseInt(k, 10));
    const firstIndicies: Obj<number> = {};
    for (const i of queryIndices) {
      firstIndicies[i] = requests.length;
      requests.push(
        ...activeQueries[i].pending!.requests.map(q => ({
          query: q,
          normalize: true,
        })),
      );
      activeQueries[i].hasFetched = true;
      activeQueries[i].fetched = activeQueries[i].pending!.next;
      delete activeQueries[i].pending;
    }

    const commitIndices: number[] = [];
    for (const { request, variables } of commits) {
      commitIndices.push(requests.length);
      requests.push({ query: request, variables, normalize: true });
    }
    const commitResolves = commits.map(c => c.resolve);
    commits = [];

    if (requests.length > 0) {
      const responses = await doFetch(requests);
      if (currentRun > resetRun) {
        state.setServer(responses[0].data, client.schema);
        for (const i of queryIndices) {
          if (activeQueries[i]) {
            activeQueries[i].firstIds = responses[firstIndicies[i]].firstIds!;
          }
        }
      }
      commitResolves.forEach((watcher, i) => {
        const { newIds, errors } = responses[commitIndices[i]];
        watcher({ newIds, errors: errors && errors.map(e => e.message) });
      });
    }
    if (currentRun > resetRun) {
      resetRun = -1;
      if (currentRun === runIndex) {
        Object.keys(activeQueries).forEach(k => {
          if (activeQueries[k].hasFetched) {
            activeQueries[k].hasFetched = false;
            activeQueries[k].watcher();
          }
        });
      }
    }
  }, 100);

  const reset = () => {
    state.setServer(
      keysToObject(Object.keys(state.server), type =>
        keysToObject(Object.keys(state.server[type]), () => null),
      ),
      client.schema,
    );
    resetRun = currentRun;
    Object.keys(activeQueries).forEach(k => {
      activeQueries[k].fetched = {};
      activeQueries[k].hasFetched = false;
      delete activeQueries[k].pending;
    });
    run();
  };

  const setAuth = (authState: AuthState | null) => {
    if (auth) {
      const doReset =
        (auth.state && auth.state.id) !== (authState && authState.id);
      if (!authState) localStorage.removeItem('kalamboAuth');
      else localStorage.setItem('kalamboAuth', JSON.stringify(authState));
      auth.state = authState;
      if (doReset) reset();
    }
  };

  const client = {
    schema: null as any,
    newId(type) {
      newIds[type] = newIds[type] || 0;
      return `LOCAL__RECORD__${newIds[type]++}`;
    },
    auth(authState?: AuthState) {
      const token = auth && auth.state && auth.state.token;
      setAuth(authState || null);
      return token;
    },

    query(...args) {
      const baseQueries: Query<string>[] = Array.isArray(args[0])
        ? args[0]
        : [args[0]];
      const [onLoad, onChange] = args.slice(1) as [
        ((data: Obj | { data: Obj; spans: Obj } | null) => void) | undefined,
        ((changes: Data) => void) | undefined
      ];

      return promisifyEmitter(innerListener => {
        const queryIndex = queryCounter++;
        let unlisten: () => void;
        schemaPromise.then(() => {
          const queries = baseQueries.map(q =>
            standardiseQuery(q, client.schema),
          );
          activeQueries[queryIndex] = {
            watcher: () => {
              const data = {};
              let updaters: ((
                changes: Obj<Obj<Obj<true>>>,
                update: boolean,
              ) => number)[];
              const readQuery = () => {
                updaters = queries.map(q =>
                  readLayer(q, client.schema, {
                    records: { '': { '': data } },
                    state,
                    firstIds: activeQueries[queryIndex].firstIds,
                    userId: auth && auth.state && auth.state.id,
                  }),
                );
                innerListener(data);
              };
              if (unlisten) unlisten();
              unlisten = state.listen(({ changes, changedData }) => {
                const updateType = updaters
                  ? Math.max(...updaters.map(u => u(changes, !onChange)))
                  : 2;
                if (updateType === 2) {
                  setPending();
                  if (
                    activeQueries[queryIndex].pending!.requests.length === 0
                  ) {
                    activeQueries[queryIndex].fetched = activeQueries[
                      queryIndex
                    ].pending!.next;
                    delete activeQueries[queryIndex].pending;
                    readQuery();
                  } else {
                    innerListener(null);
                    run();
                  }
                } else if (updateType === 1) {
                  if (!onChange) innerListener(data);
                  else onChange(changedData);
                }
              });
              readQuery();
            },
            fetched: {},
            firstIds: {},
            hasFetched: false,
          };
          const setPending = () => {
            activeQueries[queryIndex].pending = getRequests(
              client.schema,
              state,
              queries,
              activeQueries[queryIndex].fetched,
            );
          };
          setPending();
          innerListener(null);
          run();
        });
        return () => {
          delete activeQueries[queryIndex];
          if (unlisten) unlisten();
        };
      }, onLoad) as any;
    },

    set(values) {
      if (values.length !== 0) state.setClient(values);
    },

    async commit(keys: [string, string, string][]) {
      await schemaPromise;
      if (keys.length === 0) return { values: [], newIds: {} };

      let values = keys.map(key => ({
        key,
        value: noUndef(_.get(state.combined, key)),
      }));
      if (auth && auth.field) {
        const indices = { username: -1, password: -1 };
        values.forEach(({ key: [type, _, field] }, i) => {
          if (type === auth.field!.type) {
            if (field === auth.field!.field) indices.username = i;
            if (field === 'password') indices.password = i;
          }
        });
        if (indices.username !== -1 || indices.password !== -1) {
          values = [
            ...values.filter(
              (_, i) => i !== indices.username && i !== indices.password,
            ),
            {
              key: [
                auth.field!.type,
                values[indices.username].key[1] ||
                  values[indices.password].key[1],
                auth.field!.field,
              ],
              value: JSON.stringify(
                keysToObject(
                  ['username', 'password'].filter(k => indices[k] !== -1),
                  k => values[indices[k]].value,
                ),
              ),
            },
          ];
        }
      }

      const data = values.reduce((res, { key, value }) => {
        const field = this.schema![key[0]][key[2]];
        const encode = fieldIs.scalar(field) && scalars[field.scalar].encode;
        return _.set(
          res,
          key,
          value === null || !encode ? value : mapArray(value, encode),
        );
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
          request: `
            mutation Mutate(${types
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
            }
          `,
          variables: dataArrays,
          resolve,
        });
        run();
      });

      if (errors) return null;
      if (auth && newIds!['$user']) delete newIds!['$user'];
      state.setClient(keys.map(key => ({ key, value: undefined })));
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
        headers: { 'Content-Type': 'application/json' },
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
    if (auth) {
      for (const type of Object.keys(client.schema)) {
        for (const field of Object.keys(client.schema[type])) {
          if ((client.schema[type][field] as any).scalar === 'auth') {
            auth.field = { type, field };
            (client.schema[type][field] as any).scalar = 'string';
            client.schema[type].password = { scalar: 'string' };
          }
        }
      }
    }
    schemaResolve();
  })();

  return client;
}
