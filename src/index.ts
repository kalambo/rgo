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
  Schema,
} from './typings';
export { compose, getId } from './utils';

import * as throttle from 'lodash.throttle';
import keysToObject from 'keys-to-object';

import getRequests from './getRequests';
import read from './read';
import setState from './setState';
import { standardizeQueries } from './standardize';
import {
  ClientData,
  Data,
  DataChanges,
  FetchInfo,
  fieldIs,
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
  clone,
  createCompare,
  get,
  getId,
  isEqual,
  isNewId,
  mapArray,
  mapData,
  merge,
  newIdPrefix,
  locationOf,
  noUndef,
  promisifyEmitter,
  runFilter,
} from './utils';
import walker from './walker';

const addQueries = walker(
  ({ root, field, args, fields, key }, relations, {}, info: FetchInfo) => {
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
    relations.forEach(r => r.walk(info.relations[key]));
  },
);

const removeQueries = walker(
  ({ fields, key }, relations, {}, info: FetchInfo) => {
    relations.forEach(r => r.walk(info.relations[key]));
    fields.forEach(f => {
      info.relations[key].fields[f]--;
      if (info.relations[key].fields[f] === 0) {
        delete info.relations[key].fields[f];
        info.relations[key].complete.data.fields.splice(
          info.relations[key].complete.data.fields.indexOf(f),
          1,
        );
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

const queriesChanging = walker<boolean>(
  ({ fields, key }, relations, {}, info: FetchInfo) => {
    const changing = Object.keys(info.relations[key].active || {}).reduce(
      (res, k) => [...res, ...info.relations[key].active[k]],
      info.relations[key].pending ? info.relations[key].pending!.changing : [],
    );
    return (
      fields.some(f => changing.includes(f)) ||
      relations.some(r => r.walk(info.relations[key]))
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
    resolve: (response: Data<string> | string) => void;
  }[] = [];

  const getQueries = (changes?: DataChanges) => {
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
      listeners.forEach(l => l(changes));
      process();
      return true;
    }
    return false;
  };

  const set = ({ server, client }: { server?: Data; client?: ClientData }) => {
    const changes: DataChanges = {};
    if (server) setState('server', state, server, rgo.schema, changes);
    if (client) setState('client', state, client, rgo.schema, changes);
    if (log && Object.keys(changes).length > 0) console.log(clone(state));
    if (!getQueries(changes)) listeners.forEach(l => l(changes));
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
            ) as Data,
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
        mapData(state.client, (record, type, id) => {
          if (record) {
            for (const f of Object.keys(record)) {
              const field = rgo.schema[type][f];
              if (fieldIs.relation(field) && response.newIds[field.type]) {
                const mapped = mapArray(
                  record[f],
                  id => getId(id, response.newIds[field.type]) || id,
                );
                if (!isEqual(mapped, record[f])) {
                  data.client[type] = data.client[type] || {};
                  data.client[type][id] = data.client[type][id] || {};
                  data.client[type][id][f] = mapped;
                }
              }
            }
          }
        });
        processCommits.forEach(({ values }, i) => {
          if (!response.errors[i]) {
            keysToObject(values, undefined, ({ key }) => key, data.client);
            if (fetchIndex > flushFetch) {
              keysToObject(
                values,
                ({ key, value }) => {
                  if (key.length === 2) return value;
                  const field = rgo.schema[key[0]][key[2]];
                  if (fieldIs.relation(field) && response.newIds[key[0]]) {
                    return mapArray(
                      value,
                      v => getId(v, response.newIds[key[0]]) || v,
                    );
                  }
                  return value;
                },
                ({ key }) => {
                  const k = [...key];
                  k[1] = getId(k[1], response.newIds[k[0]]) || k[1];
                  return k;
                },
                data.server,
              );
            }
          }
        });
        if (fetchIndex > flushFetch) {
          data.server = merge(data.server, response.data, 2);
        }
        set(data);
        processCommits.forEach(({ resolve }, i) =>
          resolve(response.errors[i] || response.newIds),
        );
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
    set({ server: mapData(state.server, () => null) });
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
              : id
                ? state.combined[field.type][id][key]
                : record[key],
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
      schemaPromise.then(() => set({ client: { [type]: { [id]: {} } } }));
      return id;
    },

    query(...args) {
      if (args.length === 0) return schemaPromise;

      const onLoad =
        typeof args[args.length - 1] === 'function'
          ? (args[args.length - 1] as ((data: Obj | null) => void))
          : undefined;
      const baseQueries: Query[] = onLoad ? args.slice(0, -1) : args;

      return promisifyEmitter(innerListener => {
        if (baseQueries.length === 0) {
          innerListener({});
          return () => {};
        }

        let running = true;
        let first = true;
        if (!rgo.schema) {
          first = false;
          innerListener(null);
        }
        let serverQueries: ResolveQuery[];
        let listener: (changes?: DataChanges) => void;
        schemaPromise.then(() => {
          if (running) {
            const allQueries = standardizeQueries(baseQueries, rgo.schema);
            serverQueries = allQueries.filter(
              query =>
                !(
                  query.filter &&
                  query.filter[0] === 'id' &&
                  (!query.filter[query.filter.length - 1] ||
                    isNewId(query.filter[query.filter.length - 1]))
                ),
            );
            addQueries(serverQueries, rgo.schema, {}, fetchInfo);

            let current: {
              result: Obj;
              updaters: ((changes: DataChanges) => number)[];
            } | null = null;
            listener = changes => {
              if (
                queriesChanging(serverQueries, rgo.schema, {}, fetchInfo).some(
                  c => c,
                )
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
          running = false;
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
            setTimeout(() =>
              removeQueries(serverQueries, rgo.schema, {}, fetchInfo),
            );
          }
        };
      }, onLoad) as any;
    },

    set(...values) {
      if (values.length !== 0) {
        const doSet = () => {
          set({
            client: keysToObject(
              values,
              ({ value }) => value,
              ({ key }) => key,
            ) as ClientData,
          });
        };
        rgo.schema ? doSet() : schemaPromise.then(doSet);
      }
    },

    async commit(...keys) {
      await schemaPromise;
      if (keys.length === 0) return {};
      const response = await new Promise<string | Data<string>>(resolve => {
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
    const baseSchema = await resolver();
    rgo.schema = keysToObject(Object.keys(baseSchema), type =>
      keysToObject(Object.keys(baseSchema[type]), f => ({
        meta: {},
        ...baseSchema[type][f],
      })),
    );
    schemaResolve({});
  })();

  return rgo;
}
