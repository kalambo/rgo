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
  Slice,
  Sort,
  Value,
} from './typings';
import { flatten, hash, uniqueKeys } from './utils';

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

export const getDataRecordValue = (
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
  prevStore: string | null,
  prevId: string | null,
) => {
  if (isFilterArray(filter)) {
    const [type, ...filterParts] = filter;
    return (type === 'AND' ? filterParts.every : filterParts.some)(f =>
      idInFilter(schema, data, store, id, f as Filter, prevStore, prevId),
    );
  }
  const [field, op, value] = filter;

  return (field[0] === '~'
    ? getValues(
        schema,
        getCombinedData(data),
        prevStore!,
        prevId!,
        field.slice(1),
      )
    : getValues(schema, getCombinedData(data), store, id, field)
  ).some(v => {
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

export const sortIds = (
  schema: Schema,
  data: Data,
  store: string,
  ids: string[],
  sort: Sort,
) =>
  ids.sort((id1, id2) =>
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

export const getSearchIds = (
  schema: Schema,
  data: DataState,
  {
    store,
    filter,
    sort = [{ field: ['id'], direction: 'ASC' }],
    slice = { start: 0 },
  }: Search,
  prevStore: string | null,
  prevId: string | null,
) => {
  const combined = getCombinedData(data);
  const allIds = Object.keys(combined[store]);
  const ids = !filter
    ? allIds
    : allIds.filter(id =>
        idInFilter(schema, data, store, id, filter, prevStore, prevId),
      );
  const sortedIds = sortIds(schema, combined, store, ids, sort);
  const firstId =
    data.firstIds[prevStore || ''][
      [store, filter, sort, slice].map(hash).join('.')
    ][prevId || ''];
  const start = sortedIds.indexOf(firstId);
  return sortedIds.slice(
    start,
    slice.end === undefined ? undefined : start + slice.end - slice.start,
  );
};

export const idInFilterBox = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  filter: Obj<FilterRange>[],
  prevStore?: string,
  prevId?: string,
) =>
  filter.some(f =>
    Object.keys(f).every(k => {
      const path = k.split('.');
      return (path[0] === '~'
        ? getValues(schema, data, prevStore!, prevId!, path.slice(1))
        : getValues(schema, data, store, id, path)
      ).some(v => {
        if (f[k].start !== undefined && f[k].start === f[k].end) {
          return v === f[k].start;
        }
        return (
          (f[k].start === undefined || f[k].start! < v) &&
          (f[k].end === undefined || v < f[k].end!)
        );
      });
    }),
  );

export const getSliceExtra = (
  schema: Schema,
  { server, client }: DataState,
  store: string,
  filter: Obj<FilterRange>[],
  slice: Slice,
) => {
  const serverIds = Object.keys(server[store] || {}).filter(id =>
    idInFilterBox(schema, server, store, id, filter),
  );
  const clientIds = Object.keys(client[store] || {}).filter(id =>
    idInFilterBox(schema, client, store, id, filter),
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
  return {
    start: slice.start - extra.start,
    end: slice.end === undefined ? undefined : slice.end + extra.end,
  };
};
