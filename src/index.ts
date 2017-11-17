import * as enhancers from './enhancers';
export { enhancers };
import * as resolvers from './resolvers';
export { resolvers };
export {
  Enhancer,
  Field,
  fieldIs,
  ForeignRelationField,
  Query,
  RelationField,
  ResolveQuery,
  Resolver,
  Rgo,
  Scalar,
  ScalarField,
} from './typings';
export { compose } from './utils';

import * as clone from 'clone';
import * as throttle from 'lodash.throttle';
import keysToObject from 'keys-to-object';

import getRequests from './getRequests';
import read from './read';
import setState from './setState';
import { standardizeQueries } from './standardize';
import {
  DataChanges,
  FetchInfo,
  fieldIs,
  Record,
  ResolveQuery,
  Obj,
  Query,
  QueryLayer,
  RecordValue,
  Resolver,
  Rgo,
  State,
} from './typings';
import {
  createCompare,
  get,
  isEqual,
  isNewId,
  mapArray,
  merge,
  newIdPrefix,
  locationOf,
  noUndef,
  promisifyEmitter,
  runFilter,
} from './utils';
import walker from './walker';

const addQueries = walker<void, { fetchInfo: FetchInfo }>(
  ({ root, field, args, fields, path, key }, relations, { fetchInfo }) => {
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
    relations.forEach(r => r.walk());
  },
);

const removeQueries = walker<void, { fetchInfo: FetchInfo }>(
  ({ fields, path, key }, relations, { fetchInfo }) => {
    const info = path.reduce((res, k) => res.relations[k], fetchInfo);
    relations.forEach(r => r.walk());
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
  ({ fields, path, key }, relations, { fetchInfo }) => {
    const info = path.reduce((res, k) => res.relations[k], fetchInfo);
    const changing = Object.keys(info.relations[key].active || {}).reduce(
      (res, k) => [...res, ...info.relations[key].active[k]],
      info.relations[key].pending ? info.relations[key].pending!.changing : [],
    );
    return (
      fields.some(f => changing.includes(f)) || relations.some(r => r.walk())
    );
  },
);

export default function rgo(resolver: Resolver, log?: boolean): Rgo {
  let schemaResolve;
  const schemaPromise = new Promise(resolve => (schemaResolve = resolve));
  const state: State = { server: {}, client: {}, combined: {}, diff: {} };
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
  let queries: ResolveQuery[];
  let commits: {
    values: {
      key: [string, string] | [string, string, string];
      value: RecordValue | null;
    }[];
    resolve: (response: Obj<Obj<string>> | string) => void;
  }[] = [];

  const getQueries = () => {
    queries = Object.keys(fetchInfo.relations)
      .reduce<(ResolveQuery | null)[]>((res, k) => {
        const { idQueries, newFields, trace } = getRequests(
          state,
          fetchInfo.relations[k],
        );
        return [...res, ...idQueries, newFields, trace];
      }, [])
      .filter(s => s) as ResolveQuery[];
    if (queries.length > 0) {
      listeners.forEach(l => l());
      process();
      return true;
    }
    return false;
  };

  const set = ({
    server,
    client,
  }: {
    server?: Obj<Obj<Obj<RecordValue | null> | null>>;
    client?: Obj<Obj<Obj<RecordValue | null | undefined> | null | undefined>>;
  }) => {
    const changes: DataChanges = {};
    if (server) setState('server', state, server, rgo.schema, changes);
    if (client) setState('client', state, client, rgo.schema, changes);
    if (log) console.log(clone(state));
    getQueries();
    listeners.forEach(l => l(changes));
  };

  let fetchCounter: number = 0;
  let flushFetch: number = 0;
  const process = throttle(
    async () => {
      const fetchIndex = ++fetchCounter;
      const request = {
        commits: commits.map(
          c =>
            keysToObject(
              c.values.filter(
                ({ key, value }) => !isEqual(value, get(state.server, key)),
              ),
              ({ value }) => value,
              ({ key }) => key,
            ) as Obj<Obj<Record | null>>,
        ),
        queries,
        context: {},
      };
      const processCommits = commits;
      commits = [];
      if (
        request.commits.some(c => Object.keys(c).length > 0) ||
        request.queries.length > 0
      ) {
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
        const response = await resolver(request);
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
        const data = { server: {}, client: {} };
        const newIds = merge(
          ...(response.newIds.filter(n => typeof n !== 'string') as Obj[]),
        );
        const getId = (type: string, id: string | null) =>
          (id && newIds[type] && newIds[type][id]) || id;
        for (const type of Object.keys(state.client)) {
          for (const id of Object.keys(state.client[type])) {
            for (const f of Object.keys(state.client[type][id] || {})) {
              const field = rgo.schema[type][f];
              if (fieldIs.relation(field) && newIds[field.type]) {
                const mapped = mapArray(state.client[type][id]![f], id =>
                  getId(field.type, id),
                );
                if (!isEqual(mapped, state.client[type][id]![f])) {
                  data.client[type] = data.client[type] || {};
                  data.client[type][id] = data.client[type][id] || {};
                  data.client[type][id][f] = mapped;
                }
              }
            }
          }
        }
        for (const { values } of processCommits) {
          keysToObject(values, undefined, ({ key }) => key, data.client);
          if (fetchIndex > flushFetch) {
            keysToObject(
              values,
              ({ key, value }) => {
                if (key.length === 2) return value;
                const field = rgo.schema[key[0]][key[2]];
                if (fieldIs.relation(field) && newIds[key[0]]) {
                  return mapArray(value, v => getId(key[0], v));
                }
                return value;
              },
              ({ key }) => {
                const k = [...key];
                k[1] = (newIds[k[0]] && newIds[k[0]][k[1]]) || k[1];
                return k;
              },
              data.server,
            );
          }
        }
        if (fetchIndex > flushFetch) {
          data.server = merge(data.server, response.data);
        }
        set(data);
        processCommits.forEach(({ resolve }, i) => resolve(response.newIds[i]));
      } else {
        processCommits.forEach(({ resolve }) => resolve({}));
      }
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
    set({
      server: keysToObject(Object.keys(state.server), type =>
        keysToObject(Object.keys(state.server[type]), null),
      ),
    });
  };

  const getStart = (
    { root, field, args, path, key }: QueryLayer,
    rootId: string,
    recordIds: (string | null)[],
  ) => {
    const info = [...path, key].reduce((res, k) => res.relations[k], fetchInfo);
    if (!info || !info.complete.firstIds[rootId]) {
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
              : noUndef(id ? state.combined[field.type][id][key] : record[key]),
          args.sort,
        ),
      );

    const queryFirst = {
      id: info.complete.firstIds[rootId],
      ...state.server[field.type][info.complete.firstIds[rootId]!],
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
          compareRecords(state.server[field.type][id], queryFirst) === -1
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
            ((state.combined[root.type][rootId][root.field] ||
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

  const rgo: Rgo = {
    schema: null as any,
    flush,

    create(type) {
      localCounters[type] = localCounters[type] || 0;
      const id = `${newIdPrefix}${localCounters[type]++}`;
      set({ client: { [type]: { [id]: {} } } });
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
      const baseQueries: Query[] = onLoad ? args.slice(0, -1) : args;

      return promisifyEmitter(innerListener => {
        let serverQueries: ResolveQuery[];
        let listener: (changes?: DataChanges) => void;
        schemaPromise.then(() => {
          if (baseQueries.length === 0) {
            innerListener({});
          } else {
            const allQueries = standardizeQueries(baseQueries, rgo.schema);
            serverQueries = allQueries.filter(
              query =>
                !(
                  query.filter &&
                  query.filter[0] === 'id' &&
                  isNewId(query.filter[query.filter.length - 1])
                ),
            );
            addQueries(serverQueries, rgo.schema, { fetchInfo });

            let first = true;
            let current: {
              result: Obj;
              updaters: ((changes: Obj<Obj<Obj<true>>>) => number)[];
            } | null = null;
            listener = changes => {
              if (
                queriesChanging(serverQueries, rgo.schema, {
                  fetchInfo,
                }).some(c => c)
              ) {
                if (first || current) {
                  first = false;
                  current = null;
                  innerListener(null);
                }
              } else {
                const updateType =
                  current && current.updaters && changes
                    ? Math.max(...current.updaters.map(u => u(changes)))
                    : 2;
                if (updateType === 2) {
                  current = read(
                    allQueries,
                    rgo.schema,
                    state.combined,
                    getStart,
                  );
                }
                if (updateType) innerListener(current!.result);
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
            removeQueries(serverQueries, rgo.schema, { fetchInfo });
          }
        };
      }, onLoad) as any;
    },

    set(...values) {
      if (values.length !== 0) {
        set({
          client: keysToObject(
            values,
            ({ value }) => value,
            ({ key }) => key,
          ) as Obj<Obj<Obj<RecordValue | null | undefined> | null | undefined>>,
        });
      }
    },

    async commit(...keys) {
      await schemaPromise;
      if (keys.length === 0) return {};
      const response = await new Promise<string | Obj<Obj<string>>>(resolve => {
        commits.push({
          values: keys.map(key => ({
            key,
            value: key.length === 2 ? null : noUndef(get(state.combined, key)),
          })),
          resolve,
        });
        process();
      });
      if (typeof response === 'string') throw new Error(response);
      return response;
    },
  };

  (async () => {
    rgo.schema = await resolver();
    schemaResolve({});
  })();

  return rgo;
}
