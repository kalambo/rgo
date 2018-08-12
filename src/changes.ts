import { diffArrays } from 'diff';

import { getCombinedData, getFilterIds, mergeData, sortIds } from './data';
import { Data, Obj, Schema, Search, State, Value } from './typings';

type Change<T> = { index: number; added?: T[]; removed?: number; value?: any };

const getArrayChanges = <T = any>(
  array1: T[],
  array2: T[],
  mapAdded?: (v: T) => any,
  mapUnchanged?: (v: T) => any,
) => {
  const d = diffArrays(array1, array2);
  const changes: Change<T>[] = [];
  const unchanged: Change<T>[] = [];
  let index = 0;
  let i = 0;
  while (i < d.length) {
    if (d[i].added || d[i].removed) {
      const d2 = d[i + 1] || {};
      const added = d[i].added ? d[i].value : d2.added ? d2.value : null;
      const removed = d[i].removed ? d[i].count : d2.removed ? d2.count : null;
      changes.push({
        index,
        ...(added ? { added: mapAdded ? added.map(mapAdded) : added } : {}),
        ...(removed ? { removed } : {}),
      });
      if (added) index += added.length;
      if (removed) index += removed;
      if (d2.added || d2.removed) i++;
    } else {
      for (let j = 0; j < d[i].count!; j++) {
        const v = array2[index + j];
        unchanged.push({
          index: index + j,
          value: mapUnchanged ? mapUnchanged(v) : v,
        });
      }
    }
    index += d[i].count!;
    i++;
  }
  return { changes, unchanged };
};

const getNestedRecord = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  fields: Obj<true | Obj>,
) =>
  Object.keys(fields).map(field => {
    const value = data[store][id][field];
    const nextFields = fields[field];
    if (nextFields === true) return value;
    if (Array.isArray(value)) {
      return value.map(id =>
        getNestedRecord(
          schema,
          data,
          schema[store][field],
          id as string,
          nextFields,
        ),
      );
    }
    return getNestedRecord(
      schema,
      data,
      schema[store][field],
      value as string,
      nextFields,
    );
  });

const getChanges = (
  schema: Schema,
  data1: Data,
  data2: Data,
  store: string,
  id: string,
  fields: Obj<true | Obj>,
) =>
  Object.keys(fields).map(field => {
    const v1 = data1[store][id][field];
    const v2 = data1[store][id][field];
    const nextFields = fields[field];
    if (Array.isArray(v1)) {
      if (nextFields === true) {
        return getArrayChanges(v1, v2 as Value[]).changes;
      }
      const { changes, unchanged } = getArrayChanges(
        v1,
        v2 as Value[],
        id => getNestedRecord(schema, data2, store, id as string, nextFields),
        id =>
          getChanges(
            schema,
            data1,
            data2,
            schema[store][field],
            id as string,
            nextFields,
          ),
      );
      return [...changes, ...unchanged];
    }
    if (v1 !== v2) {
      if (nextFields === true) return v2;
      return getNestedRecord(schema, data2, store, v2 as string, nextFields);
    }
    if (nextFields === true) return undefined;
    return getChanges(
      schema,
      data1,
      data2,
      schema[store][field],
      v2 as string,
      nextFields,
    );
  });

const getSearchIds = (
  schema: Schema,
  data: Data,
  { store, filter, sort, slice = { start: 0 } }: Search,
) =>
  sortIds(
    schema,
    data,
    store,
    getFilterIds(schema, data, store, filter),
    sort,
  ).slice(slice.start, slice.end);

const getSearchesChanges = (
  state: State,
  searches: Search[],
  dataChanges: Data,
) => {
  const data = getCombinedData(state);
  const updated = mergeData(data, dataChanges);
  searches.reduce((res, search) => {
    const ids = getSearchIds(state.schema, data, search);
    const newIds = getSearchIds(state.schema, updated, search);

    const nestedFields = (search.fields.filter(f =>
      Array.isArray(f),
    ) as string[][]).reduce(
      (result, field) =>
        field.reduce((res, f, i) => {
          if (i === field.length - 1) res[f] = true;
          res[f] = res[f] || {};
          return res;
        }, result),
      {} as Obj<true | Obj>,
    );

    const { changes, unchanged } = getArrayChanges(
      ids,
      newIds,
      id =>
        getNestedRecord(state.schema, updated, search.store, id, nestedFields),
      id =>
        getChanges(state.schema, data, updated, search.store, id, nestedFields),
    );

    return { ...res, [name]: [...changes, ...unchanged] };
  }, {});
};

export const emitChanges = (state: State, dataChanges: Data) => {
  state.queries.forEach(({ searches, onChange }) => {
    onChange(getSearchesChanges(state, searches, dataChanges));
  });
};
