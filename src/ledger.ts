import keysToObject from 'keys-to-object';

import {
  FieldPath,
  Filter,
  FilterRange,
  isFilterArray,
  Ledger,
  LedgerFields,
  Obj,
  Search,
  Slice,
  Sort,
  State,
  Value,
} from './typings';
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
  if (filter.operation === 'in') {
    return flatten(
      filter.value.map(v =>
        getFilterMaps({ ...filter, operation: '=', value: v }),
      ),
    );
  }
  const { field, operation, value } = filter;
  const key = field.join('.');
  if (operation === '!=' && value === null) return [{ [key]: {} }];
  return flatten((operation === '!=' ? '<>' : operation).split('').map(op => {
    if (op === '=') return [{ [key]: { start: value, end: value } }];
    if (op === '<') return [{ [key]: { end: value } }];
    return [{ [key]: { start: null, end: null } }, { [key]: { start: value } }];
  }) as Obj<FilterRange>[][]);
};

const getAllFilterValues = (filterMaps: Obj<FilterRange>[]) => {
  const valueSets = filterMaps.reduce(
    (result, map) =>
      Object.keys(map).reduce((res, k) => {
        res[k] = res[k] || new Set();
        if (map[k].start !== undefined && map[k].start !== null) {
          res[k].add(map[k].start!);
        }
        if (map[k].end !== undefined && map[k].end !== null) {
          res[k].add(map[k].end!);
        }
        return res;
      }, result),
    {} as Obj<Set<Value>>,
  );
  return keysToObject(Object.keys(valueSets), k => [
    undefined,
    ...Array.from(valueSets[k]).sort(),
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
          }
          return result.map(v => ({ ...f, [k]: v }));
        }),
      ),
    [filterMap],
  );

const getGroups = (fieldsArray: (FieldPath | Ledger)[][]) => {
  const hashMap: Obj<Ledger | FieldPath> = {};
  const indicesMap = fieldsArray.reduce(
    (result, fields, i) =>
      fields.reduce((res, f) => {
        const h = hash(f);
        hashMap[h] = f;
        return { ...res, [h]: [...(res[h] || []), i] };
      }, result),
    {} as Obj<number[]>,
  );
  const groupMap = Object.keys(indicesMap).reduce(
    (res, h) => {
      const key = indicesMap[h].sort().join('.');
      return { ...res, [key]: [...(res[key] || []), h] };
    },
    {} as Obj<string[]>,
  );
  return Object.keys(groupMap).map(key => {
    const allFields = groupMap[key].map(h => hashMap[h]);
    return {
      fields: allFields.filter(f => Array.isArray(f)) as FieldPath[],
      ledgers: allFields.filter(f => !Array.isArray(f)) as Ledger[],
      indices: key.split('.').map(i => parseInt(i, 10)),
    };
  });
};

const groupByFunc = <T, U, V>(
  items: T[],
  func: (item: T) => U,
  map: (items: T[]) => V,
): [U, V][] => {
  const hashMap = {} as Obj<U>;
  const groups = items.reduce(
    (res, item) => {
      const value = func(item);
      const h = hash(value);
      hashMap[h] = value;
      return { ...res, [h]: [...(res[h] || []), item] };
    },
    {} as Obj<T[]>,
  );
  return Object.keys(groups).map(h => [hashMap[h], map(groups[h])] as [U, V]);
};

const combineSlices = (slices: Slice[]) => {
  const sorted = slices.sort((s1, s2) => s1.start - s2.start);
  const result: Slice[] = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i].start;
    let end = sorted[i].end;
    i++;
    while (end !== undefined && sorted[i] && sorted[i].start < end) {
      end = sorted[i].end;
      i++;
    }
    result.push({ start, end });
    if (end === undefined) break;
    i++;
  }
  return result;
};

const combineSelections = (
  selections: {
    filter: Obj<FilterRange>[];
    sort: Sort;
    slice: Slice | undefined;
  }[],
) => {
  const allHashMap: Obj<Obj<FilterRange>> = {};
  selections.filter(s => !s.slice).map(s =>
    s.filter.forEach(f => {
      const h = hash(f);
      allHashMap[h] = f;
    }),
  );
  const allHashes = Object.keys(allHashMap);
  const pageSelections = selections.filter(
    s => s.slice && s.filter.some(f => !allHashes.includes(hash(f))),
  );
  return {
    all: allHashes.map(h => allHashMap[h]),
    pages: groupByFunc(
      pageSelections,
      s => s.filter.sort((f1, f2) => hash(f1).localeCompare(hash(f2))),
      pageSels =>
        groupByFunc(
          pageSels,
          s => s.sort,
          sortSels => combineSlices(sortSels.map(s => s.slice) as Slice[]),
        ),
    ),
  };
};

const getLedgerFields = (fields: FieldPath[]): LedgerFields => {
  const fieldsMap = fields.reduce(
    (res, [field, ...path]) => ({
      ...res,
      [field]: path.length === 0 ? null : [...(res[field] || []), path],
    }),
    {} as Obj<FieldPath[] | null>,
  );
  return keysToObject(
    Object.keys(fieldsMap),
    k => fieldsMap[k] && getLedgerFields(fieldsMap[k]!),
  );
};

const getLedgers = (searchesArray: Search[][]): Ledger[][] => {
  const indexedSearches = flatten(
    searchesArray.map((fields, index) =>
      fields.map(search => ({ index, search })),
    ),
  );
  const storeSearches = indexedSearches.reduce(
    (res, s) => ({
      ...res,
      [s.search.store]: [...(res[s.search.store] || []), s],
    }),
    {} as Obj<{ search: Search; index: number }[]>,
  );
  return Object.keys(storeSearches).reduce(
    (result, store) => {
      const searches = storeSearches[store].map(s => s.search);
      const searchLedgers = getLedgers(
        searches.map(s => s.fields.filter(f => !Array.isArray(f)) as Search[]),
      );
      const fieldsArray = searchLedgers.map((ledgers, i) => [
        ...(searches[i].fields.filter(f => Array.isArray(f)) as FieldPath[]),
        ...ledgers,
      ]);
      const fieldGroups = getGroups(fieldsArray);

      const filterMaps = searches.map(s => s.filter && getFilterMaps(s.filter));
      const allFilterValues = getAllFilterValues(
        flatten(filterMaps.filter(f => f) as Obj<FilterRange>[][]),
      );
      const splitFilters = filterMaps.map(filter =>
        flatten((filter || [{}]).map(f => splitFilterMap(f, allFilterValues))),
      );

      return fieldGroups.reduce(
        (res, { fields, ledgers, indices }, searchIndex) => {
          res[searchIndex] = [
            ...(result[searchIndex] || []),
            {
              store,
              ...combineSelections(
                indices.map(i => ({
                  filter: splitFilters[i],
                  sort: searches[i].sort || [
                    { field: ['id'], direction: 'ASC' },
                  ],
                  slice: searches[i].slice,
                })),
              ),
              fields: getLedgerFields(fields),
              ledgers,
            },
          ];
          return res;
        },
        result,
      );
    },
    [] as Ledger[][],
  );
};

export const getSearchesRequest = (state: State, searches: Search[]) => {};
