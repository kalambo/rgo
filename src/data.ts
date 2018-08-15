import keysToObject from 'keys-to-object';

import {
  Data,
  DataState,
  FieldPath,
  Filter,
  FilterRange,
  isFilterArray,
  Obj,
  Schema,
  Search,
  Sort,
  Value,
} from './typings';
import { flatten } from './utils';

const uniqueKeys = (obj1: Obj, obj2: Obj) =>
  Array.from(new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]));

export const mergeData = (data1: Data, data2: Data): Data =>
  keysToObject(uniqueKeys(data1, data2), store =>
    keysToObject(uniqueKeys(data1[store], data2[store]), id =>
      keysToObject(
        uniqueKeys(
          data1[store] && data1[store][id],
          data2[store] && data2[store][id],
        ),
        field => {
          const v1 =
            data1[store] && data1[store][id] && data1[store][id][field];
          const v2 =
            data2[store] && data2[store][id] && data2[store][id][field];
          return v2 === undefined ? v1 : v2;
        },
      ),
    ),
  );

const getCombinedData = (data: DataState): Data =>
  mergeData(data.server, data.client);

const getDataRecordValue = (
  data: Data,
  store: string,
  id: string,
  field: string,
): null | Value | Value[] => {
  const value = [store, id, field].reduce(
    (res, k) => res && res[k],
    data as any,
  );
  return value === undefined ? null : value;
};

export const getRecordValue = (
  data: DataState,
  store: string,
  id: string,
  field: string,
) => getDataRecordValue(getCombinedData(data), store, id, field);

const getValues = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  [field, ...path]: FieldPath,
): Value[] => {
  const value = getDataRecordValue(data, store, id, field);
  const valueArray =
    value === null ? [] : Array.isArray(value) ? value : [value];
  if (!path.length) return valueArray;
  const newStore = schema[store][field];
  return flatten(
    valueArray.map(id => getValues(schema, data, newStore, id as string, path)),
  );
};

const idInFilter = (
  schema: Schema,
  data: DataState,
  store: string,
  id: string,
  filter: Filter,
) => {
  if (isFilterArray(filter)) {
    const [type, ...filterParts] = filter;
    return (type === 'AND' ? filterParts.every : filterParts.some)(f =>
      idInFilter(schema, data, store, id, f as Filter),
    );
  }
  const [field, op, value] = filter;
  return getValues(schema, getCombinedData(data), store, id, field).some(v => {
    if (op === '=') return v === value;
    if (op === '!=') return v !== value;
    if (op === '<') return v < value!;
    if (op === '>') return v > value!;
    if (op === '<=') return v <= value!;
    if (op === '>=') return v >= value!;
    return (value as (Value | null)[]).includes(v);
  });
};

const compareValues = (values1, values2) => {
  for (const i of Array.from({
    length: Math.max(values1.length, values2.length),
  }).map((_, i) => i)) {
    if (values1[i] === undefined || values1[i] < values2[i]) return -1;
    if (values2[i] === undefined || values1[i] > values2[i]) return 1;
  }
  return 0;
};

const sortIds = (
  schema: Schema,
  data: Data,
  store: string,
  ids: string[],
  sort?: Sort,
) => {
  if (!sort) return ids;
  return ids.sort((id1, id2) =>
    sort.reduce((res, { field, direction }) => {
      if (res !== 0) return res;
      const v1 = getValues(schema, data, store, id1, field);
      const v2 = getValues(schema, data, store, id2, field);
      if (!v1.length && !v2.length) return 0;
      if (!v1.length) return 1;
      if (!v2.length) return -1;
      return (direction === 'ASC' ? 1 : -1) * compareValues(v1, v2);
    }, 0),
  );
};

export const getSearchIds = (
  schema: Schema,
  data: DataState,
  path: (string | number)[],
  { store, filter, sort, slice = { start: 0 } }: Search,
) => {
  const combined = getCombinedData(data);
  const allIds = Object.keys(combined[store]);
  const ids = !filter
    ? allIds
    : allIds.filter(id => idInFilter(schema, data, store, id, filter));
  const sortedIds = sortIds(schema, combined, store, ids, sort);
  const markId = path.reduce((res, p) => res && res[p], data.marks);
  const start = true ? 0 : sortedIds.indexOf(markId);
  return sortedIds.slice(
    start,
    slice.end === undefined ? undefined : start + slice.end - slice.start,
  );
};

const idInFilterBox = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  filter: Obj<FilterRange>,
) =>
  Object.keys(filter).every(k => {
    const path = k.split('.');
    return getValues(schema, data, store, id, path).some(v => {
      if (filter[k].start !== undefined && filter[k].start === filter[k].end) {
        return v === filter[k].start;
      }
      return (
        (filter[k].start === undefined || filter[k].start! < v) &&
        (filter[k].end === undefined || v < filter[k].end!)
      );
    });
  });

export const getSliceExtra = (
  schema: Schema,
  { server, client }: DataState,
  store: string,
  filter: Obj<FilterRange>[],
) => {
  const serverIds = Object.keys(server[store] || {}).filter(id =>
    filter.some(f => idInFilterBox(schema, server, store, id, f)),
  );
  const clientIds = Object.keys(client[store] || {}).filter(id =>
    filter.some(f => idInFilterBox(schema, client, store, id, f)),
  );
  const extra = { start: 0, end: 0 };
  clientIds.forEach(id => {
    if (!serverIds.includes(id)) {
      extra.start++;
    } else if (client[store][id] === null) {
      extra.end++;
    } else {
      extra.start++;
      extra.end++;
    }
  });
  return extra;
};
