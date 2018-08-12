import {
  Data,
  FieldPath,
  Filter,
  isFilterArray,
  Schema,
  Sort,
  State,
  Value,
} from './typings';

const flatten = <T = any>(arrays: T[][]) =>
  arrays.reduce((res, a) => res.concat(a), []);

export const mergeData = (data1: Data, data2: Data): Data => ({});

export const getCombinedData = (state: State): Data => ({});

export const getValues = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  [field, ...path]: FieldPath,
): Value[] => {
  const value = data[store][id][field];
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
  data: Data,
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
  return getValues(schema, data, store, id, filter.field).some(v => {
    if (filter.operation === '=') return v === filter.value;
    if (filter.operation === '!=') return v !== filter.value;
    if (filter.operation === '<') return v < filter.value;
    if (filter.operation === '>') return v > filter.value;
    if (filter.operation === '<=') return v <= filter.value;
    if (filter.operation === '>=') return v >= filter.value;
    return (filter.value as Value[]).includes(v);
  });
};

export const getFilterIds = (
  schema: Schema,
  data: Data,
  store: string,
  filter?: Filter,
) => {
  const ids = Object.keys(data[store]);
  if (!filter) return ids;
  return ids.filter(id => idInFilter(schema, data, store, id, filter));
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
  sort?: Sort,
) =>
  !sort
    ? ids
    : ids.sort((id1, id2) =>
        sort.reduce((res, { field, direction }) => {
          if (res !== 0) return res;
          const v1 = getValues(schema, data, store, id1, field);
          const v2 = getValues(schema, data, store, id2, field);
          if (!v1.length && !v2.length) return 0;
          if (!v1.length) return 1;
          if (!v2.length) return -1;
          return (direction === 'Asc' ? 1 : -1) * compareValues(v1, v2);
        }, 0),
      );
