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
  queryWalker,
  sortedStringify,
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

const addQuery = queryWalker<
  void,
  { info: Obj<FetchInfo> }
>(({ root, field, args, fields, path }, { info }, walkRelations) => {
  const infoKey = `${sortedStringify(field)},${sortedStringify(args)}`;
  info[root.path].relations[infoKey] = info[root.path].relations[infoKey] || {
    name: root.field,
    field: field,
    args: args,
    fields: {},
    relations: {},
    complete: {
      data: { fields: [], slice: { start: 0, end: 0 }, ids: [] },
      firstIds: {},
    },
    active: {},
  };
  info[path] = info[root.path].relations[infoKey];
  fields.forEach(f => (info[path].fields[f] = (info[path].fields[f] || 0) + 1));
  walkRelations();
});

const removeQuery = queryWalker<
  void,
  { info: Obj<FetchInfo> }
>(({ root, field, args, fields, path }, { info }, walkRelations) => {
  const infoKey = `${sortedStringify(field)},${sortedStringify(args)}`;
  info[path] = info[root.path].relations[infoKey];
  walkRelations();
  fields.forEach(f => {
    info[path].fields[f]--;
    if (info[path].fields[f] === 0) delete info[path].fields[f];
  });
  if (
    Object.keys(info[path].fields).length === 0 &&
    Object.keys(info[path].relations).length === 0
  ) {
    delete info[root.path].relations[infoKey];
  }
});

const queryChanging = queryWalker<
  boolean,
  { info: Obj<FetchInfo> }
>(({ root, field, args, fields, path }, { info }, walkRelations) => {
  const infoKey = `${sortedStringify(field)},${sortedStringify(args)}`;
  info[path] = info[root.path].relations[infoKey];
  const changing = Object.keys(info[path].active || {}).reduce(
    (res, k) => [...res, ...info[path].active![k].changing],
    info[path].pending ? info[path].pending!.changing : [],
  );
  return fields.some(f => changing.includes(f)) || walkRelations().some(r => r);
});

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

  const fetchInfo: FetchInfo = {
    name: '',
    field: { type: '' },
    args: {},
    fields: {},
    relations: {},
    complete: {
      data: { fields: [], slice: { start: 0, end: 0 }, ids: [] },
      firstIds: {},
    },
    active: {},
  };
  let queries: string[];
  const listeners: ((changes?: DataChanges) => void)[] = [];
  let commits: {
    request: string;
    variables: Obj<any[]>;
    resolve: (
      response: { newIds?: Obj<Obj<string>>; errors?: string[] },
    ) => void;
  }[] = [];

  const getQueries = () => {
    queries = Object.keys(fetchInfo.relations)
      .reduce(
        (res, k, index) => {
          const { idQueries, newFields, trace } = getRequests(
            client.schema,
            state,
            fetchInfo.relations[k],
            index,
          );
          return [
            ...res,
            ...idQueries.map((q, i) => `i${res.length + i}:${q}`),
            newFields,
            trace,
          ];
        },
        [] as string[],
      )
      .filter(s => s);
    if (queries.length > 0) {
      listeners.forEach(l => l());
      run();
      return true;
    }
    return false;
  };

  const set = (
    data: Obj<Obj<Obj<FieldValue | null | undefined> | null | undefined>>,
    schema?: Obj<Obj<Field>>,
  ) => {
    const changes = setState(state, data, schema);
    plugins.forEach(p => {
      if (p.onChange) p.onChange(state, changes);
    });
    getQueries();
    listeners.forEach(l => l(changes));
  };

  let fetchCounter: number = 0;
  let resetFetch: number = 0;
  const run = _.throttle(
    async () => {
      const fetchIndex = ++fetchCounter;
      const requests: QueryRequest[] = [];

      const hasQueries = queries.length > 0;
      if (hasQueries) {
        requests.push({
          query: `{\n  ${queries.join('\n')}\n}`,
          normalize: true,
        });
        const setFetched = (info: FetchInfo, path: string) => {
          if (info.pending) {
            info.complete.data = info.pending!.data;
            info.active[fetchIndex] = {
              path,
              changing: info.pending!.changing,
            };
            delete info.pending;
          }
          Object.keys(info.relations).forEach(k => {
            if (info.relations[k].pending) {
              const alias = info.relations[k].pending!.alias;
              setFetched(info.relations[k], path ? `${path}_${alias}` : alias);
            }
          });
        };
        setFetched(fetchInfo, '');
      }

      const commitIndices: number[] = [];
      for (const { request, variables } of commits) {
        commitIndices.push(requests.length);
        requests.push({ query: request, variables, normalize: true });
      }
      const commitResolves = commits.map(c => c.resolve);
      commits = [];

      const responses = await baseFetch(requests, {});
      if (hasQueries) {
        const updateInfo = (info: FetchInfo, firstIds: Obj<Obj<string>>) => {
          if (info.active[fetchIndex]) {
            info.complete.firstIds =
              firstIds[info.active[fetchIndex].path] || info.complete.firstIds;
            delete info.active[fetchIndex];
          }
          Object.keys(info.relations).forEach(k =>
            updateInfo(info.relations[k], firstIds),
          );
        };
        updateInfo(fetchInfo, responses[0].firstIds!);
      }
      commitResolves.forEach((watcher, i) => {
        const { newIds, errors } = responses[commitIndices[i]];
        watcher({ newIds, errors: errors && errors.map(e => e.message) });
      });
      set(fetchIndex > resetFetch ? responses[0].data : {}, client.schema);
    },
    50,
    { leading: false },
  );

  const reset = () => {
    resetFetch = fetchCounter;
    const resetInfo = (info: FetchInfo) => {
      info.complete = {
        data: { fields: [], slice: { start: 0, end: 0 }, ids: [] },
        firstIds: {},
      };
      info.active = {};
      delete info.pending;
      Object.keys(info.relations).forEach(k => resetInfo(info.relations[k]));
    };
    resetInfo(fetchInfo);
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
        let serverQueries: Query[];
        let listener: (changes?: DataChanges) => void;
        schemaPromise.then(() => {
          if (baseQueries.length === 0) {
            innerListener({});
          } else {
            const allQueries = baseQueries.map(q =>
              standardiseQuery(q, client.schema),
            );
            serverQueries = allQueries.filter(
              query =>
                !(
                  query.filter &&
                  query.filter[0] === 'id' &&
                  query.filter[query.filter.length - 1].startsWith(localPrefix)
                ),
            );
            serverQueries.forEach(query =>
              addQuery(query, client.schema, { info: { '': fetchInfo } }),
            );

            let data: Obj;
            let updaters: ((changes: Obj<Obj<Obj<true>>>) => number)[] | null;
            listener = changes => {
              if (
                serverQueries.some(query =>
                  queryChanging(query, client.schema, {
                    info: { '': fetchInfo },
                  }),
                )
              ) {
                if (!data || updaters) {
                  updaters = null;
                  innerListener(null);
                }
              } else {
                const updateType =
                  updaters && changes
                    ? Math.max(...updaters.map(u => u(changes)))
                    : 2;
                if (updateType === 2) {
                  data = {};
                  updaters = allQueries.map(query =>
                    readLayer(query, client.schema, {
                      records: { '': { '': data } },
                      state,
                      info: { '': fetchInfo },
                      plugins: plugins
                        .filter(p => p.onFilter)
                        .map(p => p.onFilter!),
                    }),
                  );
                }
                if (updateType) innerListener(data);
              }
            };
            listeners.push(listener);
            if (!getQueries()) listener();
          }
        });
        return () => {
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
            serverQueries.forEach(query =>
              removeQuery(query, client.schema, { info: { '': fetchInfo } }),
            );
          }
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
