import keysToObject from 'keys-to-object';

import {
  Data,
  DataRanges,
  Filter,
  NestedFields,
  Obj,
  Range,
  Record,
  Schema,
  Search,
  Slice,
  Sort,
} from '../src/typings';
import { flatten, getNestedFields, merge, unique } from '../src/utils';

type IdRecord = { id: string } & Record;

interface Db {
  find: (
    store: string,
    filter: Filter,
    sort: Sort,
    slice: Slice,
    fields: string[],
  ) => IdRecord[];
  get: (store: string, id: string) => Record;
  update: (store: string, id: string, record: Record) => void;
}

type Listener = (index: number | null, data: Data, ranges: DataRanges) => void;

const getNestedStoreFields = (
  schema: Schema,
  store: string,
  fields: NestedFields,
) => {
  let result = keysToObject(
    Object.keys(fields).filter(f => fields[f] === null),
    null,
  );
  for (const f of Object.keys(fields).filter(f => fields[f] !== null)) {
    const nextStore = schema.links[store][f];
    result = merge(result, getNestedStoreFields(schema, nextStore, fields[f]!));
  }
  return result;
};
const getStoreFields = (schema: Schema, searches: Search[]) => {
  let result = {};
  for (const { store, filter, sort, searches: nextSearches } of searches) {
    result = merge(
      result,
      getNestedStoreFields(
        schema,
        store,
        getNestedFields([
          ...filter.map(f => Object.keys(f)),
          ...sort.map(s => s.field),
        ]),
      ),
    );
    result = merge(result, getStoreFields(schema, nextSearches));
  }
  return result;
};

const runFields = (
  schema: Schema,
  db: Db,
  storeFields: Obj<Obj<null>>,
  store: string,
  fields: NestedFields,
  records: IdRecord[],
): Data => {
  let data = {};
  for (const f of Object.keys(fields).filter(f => fields[f] !== null)) {
    const nextStore = schema.links[store][f];
    const ids = flatten(records.map(
      r => (Array.isArray(r[f]) ? r[f] : [r[f]]),
    ) as string[][]);
    const nextRecords = db.find(
      nextStore,
      ids.map(id => ({
        [id]: {
          start: { value: id, fields: [] },
          end: { value: id, fields: [] },
        },
      })),
      [{ field: ['id'], direction: 'ASC' }],
      { start: 0 },
      unique([
        ...Object.keys(fields[f]!),
        ...Object.keys(storeFields[nextStore]),
      ]),
    );
    data = merge(data, {
      nextStore: keysToObject(
        nextRecords,
        ({ id, ...record }) => record,
        r => r.id,
      ),
    });
    data = merge(
      data,
      runFields(schema, db, storeFields, store, fields[f]!, nextRecords),
    );
  }
  return data;
};

const runSearches = (
  schema: Schema,
  db: Db,
  storeFields: Obj<Obj<null>>,
  searches: Search[],
): { data: Data; ranges: DataRanges } => {
  let data = {};
  let ranges = {};
  for (const {
    store,
    filter,
    sort,
    slice,
    fields,
    searches: nextSearches,
  } of searches) {
    const nestedFields = getNestedFields(fields);
    const newRanges: Range[] = [];
    const records = flatten(
      slice.map(s => {
        const result = db.find(
          store,
          filter,
          sort,
          s,
          unique([
            ...Object.keys(nestedFields),
            ...Object.keys(storeFields[store] || {}),
          ]),
        );
        newRanges.push({ id: result[0].id, ...s });
        return result;
      }),
    );
    data = merge(data, {
      [store]: keysToObject(records, ({ id, ...record }) => record, r => r.id),
    });
    data = merge(
      data,
      runFields(schema, db, storeFields, store, nestedFields, records),
    );
    const { data: nextData, ranges: nextRanges } = runSearches(
      schema,
      db,
      storeFields,
      nextSearches,
    );
    data = merge(data, nextData);
    ranges = keysToObject(
      unique([...Object.keys(ranges), ...Object.keys(nextRanges)]),
      store => [...(ranges[store] || []), ...(nextRanges[store] || [])],
    );
    ranges[store] = [
      ...(ranges[store] || []),
      { filter, sort, ranges: newRanges },
    ];
  }
  return { data, ranges };
};

const runCommits = (schema: Schema, db: Db, commits: Data[]) => {
  for (const commit of commits) {
    for (const store of Object.keys(commit)) {
      for (const id of Object.keys(commit[store])) {
        const prev = db.get(store, id);
        const next = merge(prev, commit[store][id]);
        let update = commit[store][id];
        for (const f of Object.keys(schema.formulae[store])) {
          const { fields, formula } = schema.formulae[store][f];
          update[f] = formula(...fields.map(k => next[k]));
        }
        db.update(store, id, update);
      }
    }
  }
  return commits.reduce((res, commit) => merge(res, commit), {});
};

export const server = (schema: Schema, db: Db) => {
  const listeners: Listener[] = [];
  return () => {
    let storeFields: Obj<Obj<null>> = {};
    const localListeners: Listener[] = [];
    return {
      send: (index: number, searches: Search[], commits: Data[]) => {
        storeFields = merge(storeFields, getStoreFields(schema, searches));
        const commitData = runCommits(schema, db, commits);
        const { data, ranges } = runSearches(schema, db, storeFields, searches);
        if (commits.length > 0) {
          listeners.forEach(l => {
            if (!localListeners.includes(l)) l(null, commitData, {});
          });
        }
        localListeners.forEach(l => l(index, merge(data, commitData), ranges));
      },
      listen: (onReceive: Listener) => {
        listeners.push(onReceive);
        localListeners.push(onReceive);
        return () => {
          listeners.splice(listeners.indexOf(onReceive), 1);
          localListeners.splice(localListeners.indexOf(onReceive), 1);
        };
      },
    };
  };
};
