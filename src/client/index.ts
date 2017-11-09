export { Client, ClientPlugin } from './typings';

import * as _ from 'lodash';

import {
  createCompare,
  DataChanges,
  encodeDate,
  keysToObject,
  Field,
  fieldIs,
  FullQuery,
  localPrefix,
  locationOf,
  mapArray,
  noUndef,
  Obj,
  promisifyEmitter,
  Query,
  QueryLayer,
  read,
  Record,
  RecordValue,
  RgoRequest,
  RgoResponse,
  runFilter,
  standardiseQuery,
  walker,
} from '../core';

import getRequests from './getRequests';
import setState from './setState';
import { Client, ClientPlugin, ClientState, FetchInfo } from './typings';

const addQueries = walker<void, { fetchInfo: FetchInfo }>(
  ({ root, field, args, fields, path, key }, { fetchInfo }, walkRelations) => {
    const info = path.reduce((res, k) => res.relations[k], fetchInfo);
    info.relations[key] = info.relations[key] || {
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
    fields.forEach(
      f =>
        (info.relations[key].fields[f] =
          (info.relations[key].fields[f] || 0) + 1),
    );
    walkRelations();
  },
);

const removeQueries = walker<void, { fetchInfo: FetchInfo }>(
  ({ fields, path, key }, { fetchInfo }, walkRelations) => {
    const info = path.reduce((res, k) => res.relations[k], fetchInfo);
    walkRelations();
    fields.forEach(f => {
      info.relations[key].fields[f]--;
      if (info.relations[key].fields[f] === 0) {
        delete info.relations[key].fields[f];
      }
    });
    if (
      Object.keys(info.relations[key].fields).length === 0 &&
      Object.keys(info.relations[key].relations).length === 0
    ) {
      delete info.relations[key];
    }
  },
);

const queriesChanging = walker<boolean, { fetchInfo: FetchInfo }>(
  ({ fields, path, key }, { fetchInfo }, walkRelations) => {
    const info = path.reduce((res, k) => res.relations[k], fetchInfo);
    const changing = Object.keys(info.relations[key].active || {}).reduce(
      (res, k) => [...res, ...info.relations[key].active![k]],
      info.relations[key].pending ? info.relations[key].pending!.changing : [],
    );
    return (
      fields.some(f => changing.includes(f)) || walkRelations().some(r => r)
    );
  },
);

export default function buildClient(
  schema: Obj<Obj<Field>>,
  url: string,
  ...plugins: ClientPlugin[]
): Client {
  const baseFetch = plugins.filter(p => p.onFetch).reduce(
    (res, p) => (body: RgoRequest, headers: Obj) =>
      p.onFetch!(body, headers, res),
    async (body: RgoRequest, headers: Obj): Promise<RgoResponse> => {
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
  const listeners: ((changes?: DataChanges) => void)[] = [];
  let queries: FullQuery[];
  let commits: {
    data: Obj<Obj<Record | null>>;
    resolve: (response: string | Obj<Obj<string>>) => void;
  }[] = [];

  const getQueries = () => {
    queries = Object.keys(fetchInfo.relations)
      .reduce<(FullQuery | null)[]>((res, k) => {
        const { idQueries, newFields, trace } = getRequests(
          state,
          fetchInfo.relations[k],
        );
        return [...res, ...idQueries, newFields, trace];
      }, [])
      .filter(s => s) as FullQuery[];
    if (queries.length > 0) {
      listeners.forEach(l => l());
      process();
      return true;
    }
    return false;
  };

  const set = (
    data: Obj<Obj<Obj<RecordValue | null | undefined> | null | undefined>>,
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
  let flushFetch: number = 0;
  const process = _.throttle(
    async () => {
      const fetchIndex = ++fetchCounter;
      const request = { queries, commits: commits.map(c => c.data) };
      const commitResolves = commits.map(c => c.resolve);
      commits = [];
      if (request.queries.length > 0) {
        const setFetched = (info: FetchInfo) => {
          if (info.pending) {
            info.complete.data = info.pending.data;
            info.active[fetchIndex] = info.pending.changing;
            delete info.pending;
          }
          Object.keys(info.relations).forEach(k => {
            if (info.relations[k].pending) setFetched(info.relations[k]);
          });
        };
        setFetched(fetchInfo);
      }
      const response = await baseFetch(request, {});
      if (request.queries.length > 0) {
        const updateInfo = (info: FetchInfo, path: string) => {
          if (info.active[fetchIndex]) {
            info.complete.firstIds =
              response.firstIds[path] || info.complete.firstIds;
            delete info.active[fetchIndex];
          }
          Object.keys(info.relations).forEach(k =>
            updateInfo(info.relations[k], path ? `${path}_${k}` : k),
          );
        };
        updateInfo(fetchInfo, '');
      }
      commitResolves.forEach((watcher, i) => watcher(response.commits[i]));
      set(fetchIndex > flushFetch ? response.data : {}, client.schema);
    },
    50,
    { leading: false },
  );

  const flush = () => {
    flushFetch = fetchCounter;
    const flushInfo = (info: FetchInfo) => {
      info.complete = {
        data: { fields: [], slice: { start: 0, end: 0 }, ids: [] },
        firstIds: {},
      };
      info.active = {};
      delete info.pending;
      Object.keys(info.relations).forEach(k => flushInfo(info.relations[k]));
    };
    flushInfo(fetchInfo);
    set(
      keysToObject(Object.keys(state.server), type =>
        keysToObject(Object.keys(state.server[type]), null),
      ),
      client.schema,
    );
  };

  const getStart = (
    { root, field, args, path, key }: QueryLayer,
    rootId: string,
    recordIds: (string | null)[],
  ) => {
    const info = [...path, key].reduce((res, k) => res.relations[k], fetchInfo);
    if (!info.complete.firstIds[rootId]) {
      return args.start || 0;
    }

    const compareRecords = createCompare(
      (record: Obj, key) => record[key],
      args.sort,
    );
    const findRecordIndex = (record: Obj) =>
      locationOf(
        '',
        recordIds,
        createCompare(
          (id: string | null, key) =>
            key === 'id'
              ? id || record.id
              : noUndef(
                  id ? state.combined[field.type][id]![key] : record[key],
                ),
          args.sort,
        ),
      );

    const queryFirst = {
      id: info.complete.firstIds[rootId],
      ...state.server[field.type][info.complete.firstIds[rootId]]!,
    };
    const queryStart = findRecordIndex(queryFirst);
    let start = queryStart;
    for (const id of Object.keys(state.diff[field.type] || {})) {
      if (state.diff[field.type][id] === 1) {
        const localIndex = recordIds.indexOf(id);
        if (localIndex !== -1 && localIndex < queryStart) {
          start -= 1;
        }
      }
      if (state.diff[field.type][id] === 0) {
        if (
          state.server[field.type][id] &&
          runFilter(args.filter, id, state.server[field.type][id]) &&
          compareRecords(state.server[field.type][id]!, queryFirst) === -1
        ) {
          start += 1;
        }
        const localIndex = recordIds.indexOf(id);
        if (localIndex !== -1 && localIndex < queryStart) {
          start -= 1;
        }
      }
      if (state.diff[field.type][id] === -1) {
        const serverRecord = (state.server[field.type] || {})[id];
        if (
          serverRecord &&
          (!root.type ||
            fieldIs.foreignRelation(field) ||
            ((state.combined[root.type][rootId]![root.field] ||
              []) as string[]).includes(id)) &&
          runFilter(args.filter, id, serverRecord)
        ) {
          if (compareRecords({ id, ...serverRecord }, queryFirst) === -1) {
            start += 1;
          }
        }
      }
    }
    return start;
  };

  const client: Client = {
    schema: null as any,
    flush,

    create(type) {
      localCounters[type] = localCounters[type] || 0;
      const id = `${localPrefix}${localCounters[type]++}`;
      set({ [type]: { [id]: {} } });
      return id;
    },

    query(...args) {
      if (args.length === 0) return schemaPromise;

      const onLoad =
        typeof args[args.length - 1] === 'function'
          ? (args[args.length - 1] as ((
              data: Obj | { data: Obj; spans: Obj } | null,
            ) => void))
          : undefined;
      const baseQueries: Query<string>[] = onLoad ? args.slice(0, -1) : args;

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
            addQueries(serverQueries, client.schema, { fetchInfo });

            let data: Obj;
            let updaters: ((changes: Obj<Obj<Obj<true>>>) => number)[] | null;
            listener = changes => {
              if (
                queriesChanging(serverQueries, client.schema, {
                  fetchInfo,
                }).some(c => c)
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
                  updaters = read(allQueries, client.schema, {
                    schema: client.schema,
                    records: { '': { '': data } },
                    data: state.combined,
                    getStart,
                  });
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
            removeQueries(serverQueries, client.schema, { fetchInfo });
          }
        };
      }, onLoad) as any;
    },

    set(...values) {
      if (values.length !== 0) {
        set(values.reduce((res, v) => _.set(res, v.key, v.value), {}));
      }
    },

    async commit(...keys) {
      await schemaPromise;
      if (keys.length === 0) return { values: [], newIds: {} };

      const response = await new Promise<string | Obj<Obj<string>>>(resolve => {
        commits.push({
          data: keys.reduce((res, key) => {
            if (key.length === 2) return _.set(res, key, null);
            const field = this.schema![key[0]][key[2]];
            const isDate = fieldIs.scalar(field) && field.scalar === 'date';
            const value = noUndef(_.get(state.combined, key));
            return _.set(
              res,
              key,
              isDate ? mapArray(value, encodeDate) : value,
            );
          }, {}),
          resolve,
        });
        process();
      });

      if (typeof response === 'string') return null;
      set(keys.reduce((res, key) => _.set(res, key, undefined), {}));
      return {
        values: keys.map(
          key =>
            key.length === 2
              ? null
              : noUndef(
                  _.get(state.combined, [
                    key[0],
                    (response[key[0]] && response[key[0]][key[1]]) || key[1],
                    key[2],
                  ]),
                ),
        ),
        newIds: response,
      };
    },
  };

  (async () => {
    client.schema = keysToObject<Obj<Field>>(Object.keys(schema), type => ({
      id: { scalar: 'string' },
      createdat: { scalar: 'date' },
      modifiedat: { scalar: 'date' },
      ...schema[type],
    }));
    schemaResolve();
  })();

  return client;
}
