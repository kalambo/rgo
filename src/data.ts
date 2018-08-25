import keysToObject from 'keys-to-object';

import {
  Data,
  DataState,
  FieldPath,
  Filter,
  RecordValue,
  Schema,
  Sort,
  Value,
} from './typings';
import { flatten, maxValue, minValue, uniqueKeys } from './utils';

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

export const getCombinedData = (data: DataState): Data =>
  mergeData(data.server, data.client);

export const getDataRecordValue = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  field: string,
): RecordValue | undefined => {
  if (schema.formulae[store] && schema.formulae[store][field]) {
    const values = schema.formulae[store][field].fields.map(f =>
      getDataRecordValue(schema, data, store, id, f),
    );
    if (values.some(v => v === undefined)) return undefined;
    return schema.formulae[store][field].formula(...(values as RecordValue[]));
  }
  const value = [store, id, field].reduce(
    (res, k) => res && res[k],
    data as any,
  );
  return value === undefined ? null : value;
};

export const getRecordValue = (
  schema: Schema,
  data: DataState,
  store: string,
  id: string,
  field: string,
) => getDataRecordValue(schema, getCombinedData(data), store, id, field);

const getValues = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  [field, ...path]: FieldPath,
): (Value | undefined)[] => {
  const value = getDataRecordValue(schema, data, store, id, field);
  const valueArray =
    value === null ? [] : Array.isArray(value) ? value : [value];
  if (!path.length) return valueArray;
  const newStore = schema.links[store][field];
  return flatten(
    valueArray.map(id => getValues(schema, data, newStore, id as string, path)),
  );
};

export const idInFilter = (
  schema: Schema,
  data: Data,
  store: string,
  id: string,
  filter: Filter,
) =>
  filter.some(f =>
    Object.keys(f).every(k =>
      getValues(schema, data, store, id, k.split('.')).some(
        v =>
          f[k].start.value === f[k].end.value
            ? v === f[k].start.value
            : maxValue(f[k].start.value, v) === v &&
              minValue(f[k].end.value, v) === v,
      ),
    ),
  );

const compareValues = (values1, values2) => {
  for (const i of Array.from({
    length: Math.max(values1.length, values2.length),
  }).map((_, i) => i)) {
    if (values1[i] === undefined || values1[i] < values2[i]) return -1;
    if (values2[i] === undefined || values1[i] > values2[i]) return 1;
  }
  return 0;
};

export const compareIds = (
  schema: Schema,
  data: Data,
  store: string,
  sort: Sort,
) => (id1: string, id2: string) =>
  sort.reduce((res, { field, direction }) => {
    if (res !== 0) return res;
    const v1 = getValues(schema, data, store, id1, field);
    const v2 = getValues(schema, data, store, id2, field);
    if (!v1.length && !v2.length) return 0;
    if (!v1.length) return 1;
    if (!v2.length) return -1;
    return (direction === 'ASC' ? 1 : -1) * compareValues(v1, v2);
  }, 0);

export const sortIds = (
  schema: Schema,
  data: Data,
  store: string,
  ids: string[],
  sort: Sort,
) => ids.sort(compareIds(schema, data, store, sort));
