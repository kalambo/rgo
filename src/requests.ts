import { getSliceExtra } from './data';
import { getFilterMaps, getFilterValues, splitFilterMap } from './filter';
import {
  DataState,
  FieldPath,
  FilterRange,
  Obj,
  Request,
  Schema,
  Search,
  Slice,
  Sort,
  State,
} from './typings';
import { flatten, getNestedFields, hash } from './utils';

const getFieldGroups = (fieldsArray: (FieldPath | Request)[][]) => {
  const hashMap: Obj<Request | FieldPath> = {};
  const indicesMap: Obj<number[]> = {};
  for (const [i, fields] of fieldsArray.entries()) {
    for (const f of fields) {
      const h = hash(f);
      hashMap[h] = f;
      indicesMap[h] = [...(indicesMap[h] || []), i];
    }
  }
  const groupMap: Obj<string[]> = {};
  for (const h of Object.keys(indicesMap)) {
    const key = indicesMap[h].sort((a, b) => a - b).join('.');
    groupMap[key] = [...(groupMap[key] || []), h];
  }
  return Object.keys(groupMap).map(key => {
    const allFields = groupMap[key].map(h => hashMap[h]);
    return {
      fields: allFields.filter(f => Array.isArray(f)) as FieldPath[],
      requests: allFields.filter(f => !Array.isArray(f)) as Request[],
      indices: key.split('.').map(i => parseInt(i, 10)),
    };
  });
};

const groupByHash = <T, U, V>(
  items: T[],
  newItems: T[],
  func: (item: T) => U,
  map: (items: T[], newItems: T[], value: U) => V,
): [U, V][] => {
  const hashMap = {} as Obj<U>;
  const groups: Obj<{ items: T[]; newItems: T[] }> = {};
  for (const item of newItems) {
    const value = func(item);
    const h = hash(value);
    hashMap[h] = value;
    groups[h] = groups[h] || { items: [], newItems: [] };
    groups[h].newItems.push(item);
  }
  for (const item of items) {
    const value = func(item);
    const h = hash(value);
    if (hashMap[h]) groups[h].items.push(item);
  }
  return Object.keys(groups)
    .map(h => {
      const { items, newItems } = groups[h];
      return [hashMap[h], map(items, newItems, hashMap[h])] as [U, V];
    })
    .filter(([_, v]) => (Array.isArray(v) ? v.length !== 0 : v));
};

const combineSlices = (
  schema: Schema,
  data: DataState,
  store: string,
  filter: Obj<FilterRange>[],
  sort: Sort,
  slices: Slice[],
  newSlices: Slice[],
) => {
  const extra = getSliceExtra(schema, data, store, filter, sort);
  const markers = [
    ...flatten(
      slices.map(s => [
        { index: s.start - extra.start, type: 'exclude-start' },
        {
          index: s.end === undefined ? undefined : s.end + extra.end,
          type: 'exclude-end',
        },
      ]),
    ),
    ...flatten(
      newSlices.map(s => [
        { index: s.start - extra.start, type: 'include-start' },
        {
          index: s.end === undefined ? undefined : s.end + extra.end,
          type: 'include-end',
        },
      ]),
    ),
  ];
  const result: Slice[] = [];
  let include = 0;
  let exclude = 0;
  let current;
  let i = 0;
  while (i < markers.length) {
    if (markers[i].type === 'include-start') {
      if (include === 0 && exclude === 0) current = markers[i].index;
      include++;
    } else if (markers[i].type === 'include-end') {
      if (include === 1 && exclude === 0) {
        result.push({ start: current, end: markers[i].index });
      }
      include--;
    } else if (markers[i].type === 'exclude-start') {
      if (include !== 0 && exclude === 0) {
        result.push({ start: current, end: markers[i].index });
      }
      exclude++;
    } else if (markers[i].type === 'exclude-end') {
      if (include !== 0 && exclude === 1) current = markers[i].index;
      exclude--;
    }
    i++;
  }
  return result.filter(s => s.start !== s.end);
};

interface Selection {
  filter: Obj<FilterRange>[];
  sort: Sort | undefined;
  slice: Slice | undefined;
}

const combineSelections = (
  schema: Schema,
  data: DataState,
  store: string,
  selections: Selection[],
  newSelections: Selection[],
) => {
  const allHashMap: Obj<Obj<FilterRange>> = {};
  for (const s of selections.filter(s => !s.slice)) {
    for (const f of s.filter) {
      const h = hash(f);
      allHashMap[h] = f;
    }
  }
  const allHashes = Object.keys(allHashMap);
  const newAllHashMap: Obj<Obj<FilterRange>> = {};
  for (const s of newSelections.filter(s => !s.slice)) {
    for (const f of s.filter) {
      const h = hash(f);
      newAllHashMap[h] = f;
    }
  }
  const newAllHashes = Object.keys(newAllHashMap);
  return {
    all: newAllHashes
      .filter(h => !allHashes.includes(h))
      .map(h => newAllHashMap[h]),
    pages: groupByHash(
      selections.filter(
        s => s.slice && s.filter.some(f => !newAllHashes.includes(hash(f))),
      ),
      newSelections.filter(
        s => s.slice && s.filter.some(f => !newAllHashes.includes(hash(f))),
      ),
      s => s.filter.sort((f1, f2) => hash(f1).localeCompare(hash(f2))),
      (pageSels, newPageSels, filter) =>
        groupByHash(
          pageSels,
          newPageSels,
          s => s.sort || [{ field: ['id'], direction: 'ASC' as 'ASC' }],
          (sortSels, newSortSels, sort) =>
            combineSlices(
              schema,
              data,
              store,
              filter,
              sort,
              sortSels.map(s => s.slice) as Slice[],
              newSortSels.map(s => s.slice) as Slice[],
            ),
        ),
    ),
  };
};

const getRequests = (
  schema: Schema,
  data: DataState,
  searchesArray: { searches: Search[]; isNew: boolean }[],
): Request[][] => {
  const indexedSearches = flatten(
    searchesArray.map(({ searches, isNew }, index) =>
      searches.map(search => ({ index, search, isNew })),
    ),
  );
  const storeSearches = indexedSearches.reduce(
    (res, s) => ({
      ...res,
      [s.search.store]: [...(res[s.search.store] || []), s],
    }),
    {} as Obj<{ index: number; search: Search; isNew: boolean }[]>,
  );
  const result: Request[][] = [];
  for (const store of Object.keys(storeSearches)) {
    const searches = storeSearches[store].map(s => s.search);
    const searchRequests = getRequests(
      schema,
      data,
      storeSearches[store].map(s => ({
        searches: s.search.fields.filter(f => !Array.isArray(f)) as Search[],
        isNew: s.isNew,
      })),
    );
    const fieldGroups = getFieldGroups(
      searches.map((search, i) => [
        ...(search.fields.filter(f => Array.isArray(f)) as FieldPath[]),
        ...(searchRequests[i] || []),
      ]),
    ).filter(g => g.indices.some(i => storeSearches[store][i].isNew));

    const filterMaps = searches.map(s => s.filter && getFilterMaps(s.filter));
    const allFilterValues = getFilterValues(
      flatten(filterMaps.filter(f => f) as Obj<FilterRange>[][]),
    );
    const splitFilters = filterMaps.map(filter =>
      flatten((filter || [{}]).map(f => splitFilterMap(f, allFilterValues))),
    );

    for (const { fields, requests, indices } of fieldGroups) {
      const isNewArray = indices.map(i => storeSearches[store][i].isNew);
      const selections = indices.map(i => ({
        filter: splitFilters[i],
        sort: searches[i].sort,
        slice: searches[i].slice,
      }));
      const newSelections = selections.filter((_, i) => isNewArray[i]);
      const combined = combineSelections(
        schema,
        data,
        store,
        selections.filter((_, i) => !isNewArray[i]),
        newSelections,
      );
      if (combined.all.length !== 0 || combined.pages.length !== 0) {
        for (const i of indices.map(i => storeSearches[store][i].index)) {
          result[i] = [
            ...(result[i] || []),
            {
              store,
              ...combined,
              fields: getNestedFields(fields),
              requests,
            },
          ];
        }
      }
    }
  }
  return result;
};

export const getSearchesRequest = (
  { schema, queries, data }: State,
  searches: Search[],
) =>
  getRequests(schema, data, [
    { searches, isNew: true },
    ...queries.map(q => ({ searches: q.searches, isNew: false })),
  ])[0];
