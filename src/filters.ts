import keysToObject from 'keys-to-object';

import { getRecordValue } from './data';
import { DataState, Filter, FilterRange, Obj, Schema, Value } from './typings';
import { flatten, hash, maxValue, minValue, unique } from './utils';

export const setFilterVariables = (
  schema: Schema,
  data: DataState,
  store: string,
  id: string,
  filter: Filter,
): Filter =>
  filter.map(f =>
    keysToObject(Object.keys(f), k => {
      return {
        start: {
          value: maxValue(
            ...(f[k].start.value === undefined ? [] : [f[k].start.value]),
            ...flatten(
              f[k].start.fields.map(f => {
                const v = getRecordValue(schema, data, store, id, f);
                return Array.isArray(v) ? v : [v];
              }),
            ),
          ),
          fields: [],
        },
        end: {
          value: minValue(
            ...(f[k].end.value === undefined ? [] : [f[k].end.value]),
            ...flatten(
              f[k].end.fields.map(f => {
                const v = getRecordValue(schema, data, store, id, f);
                return Array.isArray(v) ? v : [v];
              }),
            ),
          ),
          fields: [],
        },
      };
    }),
  );

const getFilterValues = (filterMaps: Filter) => {
  const valueSets: Obj<Set<Value>> = {};
  for (const map of filterMaps) {
    for (const k of Object.keys(map)) {
      valueSets[k] = valueSets[k] || new Set();
      if (
        map[k].start.value !== undefined &&
        map[k].start.value !== null &&
        map[k].start.fields.length === 0
      ) {
        valueSets[k].add(map[k].start.value!);
      }
      if (
        map[k].end.value !== undefined &&
        map[k].end.value !== null &&
        map[k].end.fields.length === 0
      ) {
        valueSets[k].add(map[k].end.value!);
      }
    }
  }
  return keysToObject(Object.keys(valueSets), k => [
    undefined,
    null,
    ...Array.from(valueSets[k]).sort((a, b) => (a === b ? 0 : a < b ? -1 : 1)),
    null,
    undefined,
  ]);
};

const splitFilterMap = (
  filterMap: Obj<FilterRange>,
  values: Obj<(Value | null | undefined)[]>,
) =>
  Object.keys(values).reduce(
    (res, k) =>
      flatten(
        res.map(f => {
          const r: FilterRange = f[k] || {
            start: { fields: [] },
            end: { fields: [] },
          };
          if (
            r.start.fields.length !== 0 ||
            r.end.fields.length !== 0 ||
            (r.start.value !== undefined && r.start.value === r.end.value)
          ) {
            return [f];
          }
          const result: FilterRange[] = [];
          const startIndex =
            r.start.value === undefined
              ? 0
              : r.start.value === null
                ? 1
                : values[k].indexOf(r.start.value);
          const endIndex =
            r.end.value === undefined
              ? values[k].length - 1
              : r.end.value === null
                ? values[k].length - 2
                : values[k].indexOf(r.end.value);
          for (let i = startIndex; i < endIndex; i++) {
            result.push({
              start: { value: values[k][i], fields: [] },
              end: { value: values[k][i + 1], fields: [] },
            });
            if (i < endIndex - 1) {
              result.push({
                start: { value: values[k][i + 1], fields: [] },
                end: { value: values[k][i + 1], fields: [] },
              });
            }
          }
          return result.map(v => ({ ...f, [k]: v }));
        }),
      ),
    [filterMap],
  );

export const getSplitFilters = (filters: Filter[]) => {
  const allFilterValues = getFilterValues(flatten(filters));
  return filters.map(filter =>
    flatten((filter || [{}]).map(f => splitFilterMap(f, allFilterValues))).sort(
      (f1, f2) => hash(f1).localeCompare(hash(f2)),
    ),
  );
};

export const compareFilters = (filter1: Filter, filter2: Filter) => {
  const hashes1 = unique(filter1.map(hash));
  const hashes2 = unique(filter2.map(hash));
  if (hashes1.every(hashes2.includes)) {
    if (hashes1.length === hashes2.length) return 0;
    return 1;
  }
  if (hashes2.every(hashes1.includes)) return -1;
  return null;
};