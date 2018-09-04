const {
  flatten,
  getNestedFields,
  keysToObject,
  maxValue,
  merge,
  minValue,
  unique,
} = require('./utils');

const getNestedStoreFields = (schema, store, fields) => {
  let result = keysToObject(
    Object.keys(fields).filter(f => fields[f] === null),
    null,
  );
  for (const f of Object.keys(fields).filter(f => fields[f] !== null)) {
    const nextStore = schema.links[store][f];
    result = merge(result, getNestedStoreFields(schema, nextStore, fields[f]));
  }
  return result;
};
const getStoreFields = (schema, searches) => {
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

const runFields = (schema, db, storeFields, store, fields, records) => {
  let data = {};
  for (const f of Object.keys(fields).filter(f => fields[f] !== null)) {
    const nextStore = schema.links[store][f];
    const ids = flatten(
      records.map(r => (Array.isArray(r[f]) ? r[f] : [r[f]])),
    );
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
        ...Object.keys(fields[f]),
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
      runFields(schema, db, storeFields, store, fields[f], nextRecords),
    );
  }
  return data;
};

const setFilterVariables = (db, store, id, filter) =>
  filter
    .map(filterMap =>
      filterMap.map(({ field, range }) => {
        const values = range.map(({ value, fields }) =>
          unique([value, ...fields.map(field => db.get(store, id)[field])]),
        );
        if (values.length === 1) {
          return values.length === 1
            ? { field, range: [{ value: values[0], fields: [] }] }
            : null;
        }
        const start = maxValue(values[0]);
        const end = minValue(values[1]);
        return start === undefined ||
          start === null ||
          end === undefined ||
          end === null ||
          start < end
          ? {
              field,
              range: [{ value: start, fields: [] }, { value: end, fields: [] }],
            }
          : null;
      }),
    )
    .filter(filterMap => filterMap.every(v => v));

const runSearches = (schema, db, storeFields, searches, prevStore, prevId) => {
  let data = {};
  let ranges = {};
  for (const {
    store,
    filter,
    sort,
    slices,
    fields,
    searches: nextSearches,
  } of searches) {
    const nestedFields = getNestedFields(fields);
    const newRanges = [];
    const setFilter = setFilterVariables(db, prevStore, prevId, filter);
    if (setFilter.length !== 0) {
      const records = flatten(
        slices.map(slice => {
          const result = db.find(
            store,
            setFilter,
            sort,
            slice,
            unique([
              ...Object.keys(nestedFields),
              ...Object.keys(storeFields[store] || {}),
            ]),
          );
          newRanges.push(
            slice.start === 0 && slice.end === undefined
              ? { filter: setFilter }
              : {
                  filter: setFilter,
                  sort,
                  ranges: [{ id: result[0] && result[0].id, ...slice }],
                },
          );
          return result;
        }),
      );
      data = merge(data, {
        [store]: keysToObject(
          records,
          ({ id, ...record }) => record,
          r => r.id,
        ),
      });
      data = merge(
        data,
        runFields(schema, db, storeFields, store, nestedFields, records),
      );
      ranges[store] = [...(ranges[store] || []), newRanges];
      for (const { id } of records) {
        const { data: nextData, ranges: nextRanges } = runSearches(
          schema,
          db,
          storeFields,
          nextSearches,
          store,
          id,
        );
        data = merge(data, nextData);
        ranges = keysToObject(
          unique([...Object.keys(ranges), ...Object.keys(nextRanges)]),
          store => [...(ranges[store] || []), ...(nextRanges[store] || [])],
        );
      }
    }
  }
  return { data, ranges };
};

const runCommits = (schema, db, commits) => {
  for (const commit of commits) {
    for (const store of Object.keys(commit)) {
      for (const id of Object.keys(commit[store])) {
        const prev = db.get(store, id);
        if (commit[store][id]) {
          const next = merge(prev, commit[store][id]);
          let update = commit[store][id];
          for (const f of Object.keys(schema.formulae[store])) {
            const { fields, formula } = schema.formulae[store][f];
            update[f] = formula(...fields.map(k => next[k]));
          }
          db.update(store, id, update);
        } else {
          db.delete(store, id);
        }
      }
    }
  }
  return commits.reduce((res, commit) => merge(res, commit), {});
};

module.exports = (schema, db) => {
  const listeners = [];
  return () => {
    let storeFields = {};
    const localListeners = [];
    return {
      send: (index, searches, commits) => {
        storeFields = merge(storeFields, getStoreFields(schema, searches));
        const commitData = runCommits(schema, db, commits);
        const { data, ranges } = runSearches(
          schema,
          db,
          storeFields,
          searches,
          null,
          null,
        );
        if (commits.length > 0) {
          listeners.forEach(l => {
            if (!localListeners.includes(l)) l(null, commitData, {});
          });
        }
        localListeners.forEach(l => l(index, merge(data, commitData), ranges));
      },
      listen: onReceive => {
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
