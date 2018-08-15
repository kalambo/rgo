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
  State,
} from './typings';
import { flatten, getNestedFields, hash } from './utils';

const cleanRequest = ({ isNew, ...request }: Request) => ({
  ...request,
  requests: request.requests.map(cleanRequest),
});

const getFieldGroups = (fieldsArray: (FieldPath | Request)[][]) => {
  const hashMap: Obj<Request | FieldPath> = {};
  const indicesMap: Obj<number[]> = {};
  for (const [i, fields] of fieldsArray.entries()) {
    for (const f of fields) {
      const h = hash(Array.isArray(f) ? f : cleanRequest(f));
      hashMap[h] = hashMap[h] || f;
      if (!Array.isArray(hashMap[h])) {
        (hashMap[h] as Request).isNew =
          (hashMap[h] as Request).isNew && (f as Request).isNew;
      }
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

const forEachHashGroup = <T, U, V>(
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

const extendSlice = (slice: Slice, extra: { start: number; end: number }) => ({
  start: slice.start - extra.start,
  end: slice.end === undefined ? undefined : slice.end + extra.end,
});

const getRequests = (
  schema: Schema,
  data: DataState,
  newData: DataState | null,
  allSearches: { searches: Search[]; isNew: boolean }[],
): Request[][] => {
  const indexedSearches = flatten(
    allSearches.map(({ searches, isNew }, index) =>
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
      newData,
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
        groupSearches.map(({ search, index, isNew }, i) => {
          const slice = search.slice || { start: 0 };
          const sort = search.sort || [
            { field: ['id'], direction: 'ASC' as 'ASC' },
          ];
          if (slice.start !== 0 || slice.end !== undefined) {
            return [{ filter: splitFilters[i], sort, slice, index, isNew }];
          }
          return splitFilters[i].map(f => ({
            filter: [f],
            sort,
            slice,
            index,
            isNew,
          }));
        }),
      );

      forEachHashGroup(
        selections,
        s => s.filter.sort((f1, f2) => hash(f1).localeCompare(hash(f2))),
        (filterSelections, filter) => {
          const extra = getSliceExtra(schema, data, store, filter);
          const newExtra =
            newData && getSliceExtra(schema, newData, store, filter);
          forEachHashGroup(
            filterSelections,
            s => s.sort,
            (sortSelections, sort) => {
              const slices = sortSelections.map(s =>
                extendSlice(s.slice, extra),
              );
              const newSlices =
                newExtra &&
                sortSelections.map(s => extendSlice(s.slice, newExtra));
              const sliceValues = [
                ...Array.from(
                  new Set(
                    flatten(
                      [...slices, ...(newSlices || [])].map(s => [
                        s.start,
                        ...(s.end !== undefined ? [s.end] : []),
                      ]),
                    ),
                  ),
                ).sort((a, b) => a - b),
                undefined,
              ];
              sortSelections.forEach(({ index }, i) => {
                const startIndex = sliceValues.indexOf(slices[i].start);
                const endIndex =
                  slices[i].end === undefined
                    ? sliceValues.length - 1
                    : sliceValues.indexOf(slices[i].end);
                const newStartIndex = newSlices
                  ? sliceValues.indexOf(newSlices[i].start)
                  : startIndex;
                const newEndIndex = newSlices
                  ? newSlices[i].end === undefined
                    ? sliceValues.length - 1
                    : sliceValues.indexOf(newSlices[i].end)
                  : endIndex;

                for (
                  let j = Math.min(startIndex, newStartIndex);
                  j < Math.max(endIndex, newEndIndex);
                  j++
                ) {
                  result[index] = [
                    ...(result[index] || []),
                    {
                      store,
                      selection: [
                        filter,
                        sort,
                        { start: sliceValues[j]!, end: sliceValues[j + 1] },
                      ],
                      fields: getNestedFields(fields),
                      requests,
                      isNew: newData
                        ? j < startIndex || j > endIndex - 1
                        : sortSelections.every(s => s.isNew),
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

const filterNewRequests = (requests: Request[]) =>
  requests
    .map(request => {
      if (request.isNew) return cleanRequest(request);
      const { store, selection, requests } = request;
      const subRequests = filterNewRequests(requests);
      if (subRequests.length === 0) return null;
      return { store, selection, fields: {}, requests: subRequests };
    })
    .filter(r => r);

export const getSearchesRequests = (
  { schema, queries, data }: State,
  searches: Search[],
) =>
  filterNewRequests(
    flatten(
      getRequests(schema, data, null, [
        { searches, isNew: true },
        ...queries.map(({ searches }) => ({ searches, isNew: false })),
      ]),
    ),
  );

export const getUpdateRequests = (
  { schema, queries, data }: State,
  newData: DataState,
) =>
  filterNewRequests(
    flatten(
      getRequests(
        schema,
        data,
        newData,
        queries.map(({ searches }) => ({ searches, isNew: false })),
      ),
    ),
  );
