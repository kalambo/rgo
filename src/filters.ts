import keysToObject from 'keys-to-object';

import { Filter, FilterRange, isFilterArray, Obj, Value } from './typings';
import { flatten, hash } from './utils';

const doRangesIntersect = (r1: FilterRange, r2: FilterRange) => {
  if (r1.start === null || r2.start === null) {
    return r1.start === null && r2.start === null;
  }
  return (
    (r1.start === undefined || r2.end === undefined || r1.start <= r2.end!) &&
    (r1.end === undefined || r2.start === undefined || r1.end! <= r2.start)
  );
};

const intersectFilterMaps = (f1: Obj<FilterRange>, f2: Obj<FilterRange>) => {
  const result: Obj<FilterRange> = {};
  for (const k of Array.from(
    new Set([...Object.keys(f1), ...Object.keys(f2)]),
  )) {
    const v1 = f1[k];
    const v2 = f2[k];
    if (v1 && v2) {
      if (!doRangesIntersect(v1, v2)) return null;
      result[k] =
        v1.start === null
          ? v1
          : {
              ...(v1.start !== undefined || v2.start !== undefined
                ? { start: v1.start! > v2.start! ? v1.start : v2.start }
                : {}),
              ...(v1.end !== undefined || v2.end !== undefined
                ? { end: v1.end! < v2.end! ? v1.end : v2.end }
                : {}),
            };
    } else {
      result[k] = v1 || v2;
    }
  }
  return result;
};

const getFilterMaps = (filter: Filter): Obj<FilterRange>[] => {
  if (isFilterArray(filter)) {
    const [type, ...filterParts] = filter;
    const subBoxes = filterParts.map(f => getFilterMaps(f as Filter));
    if (type === 'OR') return flatten(subBoxes);
    return filterParts
      .map(f => getFilterMaps(f as Filter))
      .reduce((filters1, filters2) =>
        flatten(
          filters1.map(
            f1 =>
              filters2
                .map(f2 => intersectFilterMaps(f1, f2))
                .filter(v => v) as Obj<FilterRange>[],
          ),
        ),
      );
  }
  const [field, op, value] = filter;
  if (op === 'in') {
    return flatten(
      (value as (Value | null)[]).map(v => getFilterMaps([field, '=', v])),
    );
  }
  const key = field.join('.');
  if (op === '!=' && value === null) return [{ [key]: {} }];
  return flatten((op === '!=' ? '<>' : op).split('').map(o => {
    if (o === '=') return [{ [key]: { start: value, end: value } }];
    if (o === '<') return [{ [key]: { end: value } }];
    return [{ [key]: { start: null, end: null } }, { [key]: { start: value } }];
  }) as Obj<FilterRange>[][]);
};

const getFilterValues = (filterMaps: Obj<FilterRange>[]) => {
  const valueSets: Obj<Set<Value>> = {};
  for (const map of filterMaps) {
    for (const k of Object.keys(map)) {
      valueSets[k] = valueSets[k] || new Set();
      if (map[k].start !== undefined && map[k].start !== null) {
        valueSets[k].add(map[k].start!);
      }
      if (map[k].end !== undefined && map[k].end !== null) {
        valueSets[k].add(map[k].end!);
      }
    }
  }
  return keysToObject(Object.keys(valueSets), k => [
    undefined,
    ...Array.from(valueSets[k]).sort((a, b) => (a === b ? 0 : a < b ? -1 : 1)),
    undefined,
  ]);
};

const splitFilterMap = (
  filterMap: Obj<FilterRange>,
  values: Obj<(Value | undefined)[]>,
) =>
  Object.keys(values).reduce(
    (res, k) =>
      flatten(
        res.map(f => {
          const r: FilterRange = f[k] || {};
          if (r && r.start !== undefined && r.start === r.end) return [f];
          const result: FilterRange[] = [];
          if (!f[k]) result.push({ start: null, end: null });
          const startIndex =
            r.start === undefined ? 0 : values[k].indexOf(r.start!);
          const endIndex =
            r.end === undefined
              ? values[k].length - 1
              : values[k].indexOf(r.end!);
          for (let i = startIndex; i < endIndex; i++) {
            result.push({ start: values[k][i], end: values[k][i + 1] });
            if (i < endIndex - 1) {
              result.push({ start: values[k][i + 1], end: values[k][i + 1] });
            }
          }
          return result.map(v => ({ ...f, [k]: v }));
        }),
      ),
    [filterMap],
  );

export const getSplitFilters = (filters: (Filter | undefined)[]) => {
  const filterMaps = filters.map(f => f && getFilterMaps(f));
  const allFilterValues = getFilterValues(
    flatten(filterMaps.filter(f => f) as Obj<FilterRange>[][]),
  );
  return filterMaps.map(filter =>
    flatten((filter || [{}]).map(f => splitFilterMap(f, allFilterValues))).sort(
      (f1, f2) => hash(f1).localeCompare(hash(f2)),
    ),
  );
};
