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
  map: (item: T) => U,
  func: (items: T[], value: U) => V,
) => {
  const hashMap = {} as Obj<U>;
  const groups: Obj<T[]> = {};
  for (const item of items) {
    const value = map(item);
    const h = hash(value);
    hashMap[h] = value;
    groups[h] = [...(groups[h] || []), item];
  }
  Object.keys(groups).forEach(h => func(groups[h], hashMap[h]));
};

const getRequests = (
  schema: Schema,
  data: DataState,
  newData: DataState,
  allSearches: Search[][],
): Request[][] => {
  const indexedSearches = flatten(
    allSearches.map((searches, index) =>
      searches.map(search => ({ index, search })),
    ),
  );
  const storeSearches = indexedSearches.reduce(
    (res, s) => ({
      ...res,
      [s.search.store]: [...(res[s.search.store] || []), s],
    }),
    {} as Obj<{ index: number; search: Search }[]>,
  );
  const result: Request[][] = [];
  for (const store of Object.keys(storeSearches)) {
    const searches = storeSearches[store].map(s => s.search);
    const searchRequests = getRequests(
      schema,
      data,
      newData,
      storeSearches[store].map(
        s => s.search.fields.filter(f => !Array.isArray(f)) as Search[],
      ),
    );
    const fieldGroups = getFieldGroups(
      searches.map((search, i) => [
        ...(search.fields.filter(f => Array.isArray(f)) as FieldPath[]),
        ...(searchRequests[i] || []),
      ]),
    );

    for (const { fields, requests, indices } of fieldGroups) {
      const groupSearches = indices.map(i => storeSearches[store][i]);

      const filterMaps = groupSearches.map(
        s => s.search.filter && getFilterMaps(s.search.filter),
      );
      const allFilterValues = getFilterValues(
        flatten(filterMaps.filter(f => f) as Obj<FilterRange>[][]),
      );
      const splitFilters = filterMaps.map(filter =>
        flatten((filter || [{}]).map(f => splitFilterMap(f, allFilterValues))),
      );

      const selections = flatten(
        groupSearches.map(({ search, index }, i) => {
          const slice = search.slice || { start: 0 };
          const sort = search.sort || [
            { field: ['id'], direction: 'ASC' as 'ASC' },
          ];
          if (slice.start !== 0 || slice.end !== undefined) {
            return [{ filter: splitFilters[i], sort, slice, index }];
          }
          return splitFilters[i].map(f => ({
            filter: [f],
            sort,
            slice,
            index,
          }));
        }),
      );

      groupByHash(
        selections,
        s => s.filter.sort((f1, f2) => hash(f1).localeCompare(hash(f2))),
        (filterSelections, filter) => {
          const extra = getSliceExtra(schema, data, store, filter);
          groupByHash(
            filterSelections.map(s => ({
              ...s,
              slice: {
                start: s.slice.start - extra.start,
                end:
                  s.slice.end === undefined
                    ? undefined
                    : s.slice.end + extra.end,
              },
            })),
            s => s.sort,
            (sortSelections, sort) => {
              const sliceValues = [
                ...Array.from(
                  new Set(
                    flatten(
                      sortSelections.map(({ slice }) => [
                        slice.start,
                        ...(slice.end !== undefined ? [slice.end] : []),
                      ]),
                    ),
                  ),
                ).sort((a, b) => a - b),
                undefined,
              ];
              sortSelections.forEach(({ slice, index }) => {
                const startIndex = sliceValues.indexOf(slice.start);
                const endIndex =
                  slice.end === undefined
                    ? sliceValues.length - 1
                    : sliceValues.indexOf(slice.end);
                for (let i = startIndex; i < endIndex; i++) {
                  result[index] = [
                    ...(result[index] || []),
                    {
                      store,
                      selection: [
                        filter,
                        sort,
                        { start: sliceValues[i]!, end: sliceValues[i + 1] },
                      ],
                      fields: getNestedFields(fields),
                      requests,
                    },
                  ];
                }
              });
            },
          );
        },
      );
    }
  }
  return result;
};

export const getSearchesRequests = (
  { schema, queries, data }: State,
  searches: Search[],
) => {
  const [newRequests, ...requestsArray] = getRequests(schema, data, data, [
    searches,
    ...queries.map(q => q.searches),
  ]);
  const hashes = flatten(
    requestsArray.map(requests => requests.map(r => hash(r))),
  );
  return newRequests.filter(r => !hashes.includes(hash(r)));
};
