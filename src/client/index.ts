export { Client, Query } from './typings';
export { ScalarName } from '../core';

import * as _ from 'lodash';
import {
  buildClientSchema,
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  introspectionQuery,
} from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  keysToObject,
  mapArray,
  noUndef,
  Obj,
  promisifyEmitter,
  QueryRequest,
  QueryResponse,
  scalars,
  undefOr,
} from '../core';

import ClientState from './ClientState';
import queryLayers from './queryLayers';
import readLayer from './readLayer';
import { AuthState, Client, DataChanges, Query, QueryLayer } from './typings';

const ops = { $ne: '!=', $lte: '<=', $gte: '>=', $eq: '=', $lt: '<', $gt: '>' };
const printFilter = filter => {
  const key = Object.keys(filter)[0];
  if (!key) return '';
  if (key === '$and') return `(${filter[key].map(printFilter).join(', ')})`;
  if (key === '$or') return `(${filter[key].map(printFilter).join(' | ')})`;
  const op = Object.keys(filter[key])[0];
  return `${key}${ops[op]}${filter[key][op]}`;
};

export function buildClient(
  url: string,
  authRefresh?: (
    refreshToken: string,
  ) => Promise<{ token: string; refresh: string } | null>,
  log?: boolean,
): Client {
  let schema: Obj<Obj<Field>>;
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
  const state = new ClientState(log);
  const newIds: Obj<number> = {};

  let watchers: ((ready?: boolean, indices?: number[]) => void)[] = [];
  const queries: Obj<{
    firstIds?: Obj<Obj<string>>;
    prev?: {
      ids: Obj<string[]>;
      slice: Obj<{ start: number; end?: number }>;
    };
    next?: {
      ids: Obj<string[]>;
      slice: Obj<{ start: number; end?: number }>;
      queries: string[];
    };
  }> = {};
  let commits: {
    values: { key: [string, string, string]; value: any }[];
    watcher: (
      response: { newIds?: Obj<Obj<string>>; errors?: GraphQLError[] },
    ) => void;
  }[] = [];

  let currentRun: number = -1;
  const doFetch = async (body: QueryRequest[]): Promise<QueryResponse[]> => {
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
  const run = _.throttle(async () => {
    if (schema) {
      const runIndex = ++currentRun;
      const requests: QueryRequest[] = [];

      const queryIndices = Object.keys(queries)
        .filter(k => queries[k].next)
        .map(k => parseInt(k, 10));
      const firstIndicies: Obj<number> = {};
      for (const i of queryIndices) {
        firstIndicies[i] = requests.length;
        requests.push(
          ...queries[i].next!.queries.map(query => ({
            query,
            normalize: true,
          })),
        );
        queries[i].prev = {
          ids: queries[i].next!.ids,
          slice: queries[i].next!.slice,
        };
        delete queries[i].next;
      }

      const commitIndices: number[] = [];
      for (const { values } of commits) {
        const data = values.reduce((res, { key, value }) => {
          const field = schema[key[0]][key[2]];
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
        commitIndices.push(requests.length);
        requests.push({
          query: `
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
                              fieldIs.scalar(schema[t][f]) ? f : `${f} { id }`,
                          )
                          .join('\n')}
                      }`,
                    )
                    .join('\n')}
                }
              }
            `,
          variables: dataArrays,
          normalize: true,
        });
      }
      const commitWatchers = commits.map(c => c.watcher);
      commits = [];

      if (requests.length > 0) {
        let responses: QueryResponse[];
        try {
          responses = await doFetch(requests);
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
          responses = await doFetch(requests);
        }
        state.setServer(responses[0].data, schema, queryIndices);
        for (const i of queryIndices) {
          queries[i].firstIds = responses[firstIndicies[i]].firstIds!;
        }
        commitWatchers.forEach((watcher, i) => {
          const { newIds, errors } = responses[commitIndices[i]];
          watcher({ newIds, errors });
        });
      }
      if (currentRun === runIndex) {
        watchers.forEach(w => w(true, queryIndices));
      }
    }
  }, 100);

  const setAuth = (authState: AuthState | null) => {
    if (auth) {
      const reset =
        (auth.state && auth.state.id) !== (authState && authState.id);
      if (!authState) localStorage.removeItem('kalamboAuth');
      else localStorage.setItem('kalamboAuth', JSON.stringify(authState));
      auth.state = authState;
      if (reset) {
        watchers.forEach(w => w(false));
        state.setServer(
          keysToObject(Object.keys(state.server), type =>
            keysToObject(Object.keys(state.server[type]), () => null),
          ),
          schema,
          [],
        );
        Object.keys(queries).forEach(k => (queries[k] = {}));
        run();
      }
    }
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
    schema = keysToObject(Object.keys(schemaFields), type => {
      const fields = (schemaFields[type].type as GraphQLList<
        GraphQLNonNull<GraphQLObjectType>
      >).ofType.ofType.getFields();
      return keysToObject(Object.keys(fields), field =>
        JSON.parse(fields[field].description),
      );
    });
    if (auth) {
      for (const type of Object.keys(schema)) {
        for (const field of Object.keys(schema[type])) {
          if ((schema[type][field] as any).scalar === 'auth') {
            auth.field = { type, field };
            (schema[type][field] as any).scalar = 'string';
            schema[type].password = { scalar: 'string' };
          }
        }
      }
    }
    run();
  })();

  return {
    schema() {
      return schema;
    },
    newId(type) {
      newIds[type] = newIds[type] || 0;
      return `$${newIds[type]++}`;
    },
    auth(authState?: AuthState) {
      const token = auth && auth.state && auth.state.token;
      setAuth(authState || null);
      return token;
    },

    query(...args) {
      const query: Query[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      const [onLoad, onChange] = args.slice(1) as [
        ((data: Obj | { data: Obj; spans: Obj } | null) => void) | undefined,
        ((changes: Data) => void) | undefined
      ];

      return promisifyEmitter(innerListener => {
        const queryIndex =
          Math.max(...Object.keys(queries).map(k => parseInt(k, 10)), -1) + 1;
        queries[queryIndex] = {};

        let layers: QueryLayer[] | null = null;
        let rootUpdaters:
          | ((changes: DataChanges, update: boolean) => number)[]
          | null = null;
        let data = {};

        const checkRun = () => {
          layers = layers || queryLayers(schema, query);
          queries[queryIndex].next = {
            ids: {},
            slice: {},
            queries: [],
          };
          let alreadyFetched = true;
          const processLayer = ({
            root,
            field,
            args,
            structuralFields,
            scalarFields,
            relations,
            path,
            getArgsState,
          }: QueryLayer) => {
            const fields = Array.from(
              new Set([
                'id',
                ...Object.keys(scalarFields),
                ...structuralFields,
              ]),
            );
            const base = `${root.alias ? `${root.alias}:` : ''}${root.field}`;
            const inner = `{
              ${fields.join('\n')}
              ${relations.map(processLayer).join('\n')}
            }`;
            if (fieldIs.foreignRelation(field) || field.isList) {
              const { extra, ids } = getArgsState(state);
              const prev = queries[queryIndex].prev || {
                ids: {},
                slice: {},
              };
              const newIds = prev.ids[path]
                ? ids.filter(id => !prev.ids[path].includes(id))
                : ids;
              queries[queryIndex].next!.ids[path] = ids;
              if (newIds.length > 0) {
                queries[queryIndex].next!.queries.push(`{
                  ${root.field}(filter: ["id", "in", ${JSON.stringify(
                  newIds,
                )}]) ${inner}
                }`);
              }
              if (
                !prev.slice[path] ||
                (args.start || 0) - extra.start < prev.slice[path].start ||
                (prev.slice[path].end !== undefined &&
                  (args.end === undefined ||
                    args.end + extra.end > prev.slice[path].end!))
              ) {
                alreadyFetched = false;
              }
              const fullArgs = {
                ...args,
                start: (args.start || 0) - extra.start,
                end: undefOr(args.end, args.end! + extra.end),
                offset: extra.start,
                trace: prev.slice[path],
              };
              const printedArgs = Object.keys(fullArgs)
                .filter(k => fullArgs[k] !== undefined)
                .map(
                  k =>
                    `${k}: ${JSON.stringify(fullArgs[k]).replace(
                      /\"([^(\")"]+)\":/g,
                      '$1:',
                    )}`,
                );
              queries[queryIndex].next!.slice[path] = {
                start: (args.start || 0) - extra.start,
                end: undefOr(args.end, args.end! + extra.end),
              };
              return `${base}(${printedArgs}) ${inner}`;
            }
            return `${base} ${inner}`;
          };
          const baseQuery = `{
            ${layers.map(processLayer).join('\n')}
          }`;
          if (!alreadyFetched) {
            queries[queryIndex].next!.queries.unshift(baseQuery);
          }
          if (queries[queryIndex].next!.queries.length > 0) {
            innerListener(null);
            rootUpdaters = null;
            run();
          } else {
            delete queries[queryIndex].next;
            data = {};
            rootUpdaters = layers.map(layer =>
              readLayer(
                layer,
                { '': data },
                state,
                queries[queryIndex].firstIds!,
                auth && auth.state && auth.state.id,
              ),
            );
            innerListener(data);
          }
        };

        let unlisten;
        const watcher = (ready, indices = [] as number[]) => {
          if (ready) {
            if (!layers || indices.includes(queryIndex)) checkRun();
            // if no listener for query then above checkRun() can lead to
            // immediate stop of this query, so need to check still running
            if (queries[queryIndex]) {
              unlisten =
                unlisten ||
                state.listen(({ changes, changedData, indices }) => {
                  if (!indices || !indices.includes(queryIndex)) {
                    const updateType = rootUpdaters
                      ? Math.max(
                          ...rootUpdaters.map(updater =>
                            updater(changes, !onChange),
                          ),
                        )
                      : 2;
                    if (updateType === 2) {
                      checkRun();
                    } else if (updateType === 1) {
                      if (!onChange) innerListener(data);
                      else onChange!(changedData);
                    }
                  }
                });
            }
          } else {
            innerListener(null);
            layers = null;
            rootUpdaters = null;
            if (unlisten) unlisten();
          }
        };
        watchers.push(watcher);
        if (schema) checkRun();

        return () => {
          delete queries[queryIndex];
          watchers.splice(watchers.indexOf(watcher), 1);
          if (unlisten) unlisten();
        };
      }, onLoad) as any;
    },

    set(values) {
      if (values.length !== 0) state.setClient(values);
    },

    async commit(keys: [string, string, string][]) {
      return new Promise<{
        values: any[];
        newIds: Obj;
      } | null>(resolve => {
        if (keys.length === 0) {
          resolve({ values: [], newIds: {} });
        } else {
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
          commits.push({
            values,
            watcher: async ({ newIds, errors }) => {
              if (errors) {
                resolve(null);
              } else {
                if (auth && newIds!['$user']) delete newIds!['$user'];
                state.setClient(keys.map(key => ({ key, value: undefined })));
                resolve({
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
                });
              }
            },
          });
          run();
        }
      });
    },
  };
}
