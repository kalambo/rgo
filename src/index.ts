export { default as run } from './run';
export { Query, Rgo } from './typings';
export { default as update } from './update';

import * as _ from 'lodash';

import getRequests from './getRequests';
import read from './read';
import setState from './setState';
import { standardizeQueries, standardizeSchema } from './standardize';
import {
  DataChanges,
  FetchInfo,
  Field,
  fieldIs,
  FullQuery,
  IdRecord,
  Obj,
  Query,
  QueryLayer,
  RecordValue,
  ResolveRequest,
  ResolveResponse,
  Rgo,
  State,
} from './typings';
import {
  createCompare,
  encodeDate,
  keysToObject,
  localPrefix,
  locationOf,
  mapArray,
  noUndef,
  promisifyEmitter,
  runFilter,
} from './utils';
import walker from './walker';

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
      (res, k) => [...res, ...info.relations[key].active[k]],
      info.relations[key].pending ? info.relations[key].pending!.changing : [],
    );
    return (
      fields.some(f => changing.includes(f)) || walkRelations().some(r => r)
    );
  },
);

export default function rgo(
  schema: Obj<Obj<Field>>,
  resolve: (request: ResolveRequest) => Promise<ResolveResponse>,
  log?: boolean,
): Rgo {
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
  let queries: FullQuery[];
  let commits: {
    records: Obj<IdRecord[]>;
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
    if (log) console.log(_.cloneDeep(state));
    getQueries();
    listeners.forEach(l => l(changes));
  };

  let fetchCounter: number = 0;
  let flushFetch: number = 0;
  const process = _.throttle(
    async () => {
      const fetchIndex = ++fetchCounter;
      const request = { queries, updates: commits.map(c => c.records) };
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
      const response = await resolve(request);
      commitResolves.forEach((watcher, i) => watcher(response.newIds[i]));
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
      set(fetchIndex > flushFetch ? response.data : {}, rgo.schema);
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
      rgo.schema,
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
      const baseQueries: Query[] = onLoad ? args.slice(0, -1) : args;

      return promisifyEmitter(innerListener => {
        let serverQueries: FullQuery[];
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
                  query.filter[query.filter.length - 1].startsWith(localPrefix)
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
        set(values.reduce((res, v) => _.set(res, v.key, v.value), {}));
      }
    },

    async commit(...keys) {
      await schemaPromise;
      if (keys.length === 0) return { values: [], newIds: {} };

      const data = keys.reduce((res, key) => {
        if (key.length === 2) return _.set(res, key, null);
        const field = this.schema[key[0]][key[2]];
        const isDate = fieldIs.scalar(field) && field.scalar === 'date';
        const value = noUndef(_.get(state.combined, key));
        return _.set(res, key, isDate ? mapArray(value, encodeDate) : value);
      }, {});
      const response = await new Promise<string | Obj<Obj<string>>>(resolve => {
        commits.push({
          records: keysToObject(Object.keys(data), type =>
            Object.keys(data[type]).map(id => ({ id, ...data[type][id] })),
          ),
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
    rgo.schema = standardizeSchema(schema);
    schemaResolve();
  })();

  return rgo;
}
