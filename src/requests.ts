import { getSliceExtra } from './data';
import { getSplitFilters } from './filters';
import {
  DataState,
  FieldPath,
  FilterRange,
  NestedFields,
  Obj,
  Requests,
  Schema,
  Search,
  Slice,
  Sort,
  State,
} from './typings';
import { flatten, getNestedFields, hash, merge } from './utils';

type ChunkBase = {
  name: string;
  store: string;
  filter: Obj<FilterRange>[];
  sort: Sort;
};

type FieldsChunk = ChunkBase & {
  slice: Slice[];
  fields: NestedFields;
  chunks: Chunk[];
};

type FirstIdChunk = ChunkBase & {
  slice: {
    key: string;
    index: number;
  };
};

type Chunk = FieldsChunk | FirstIdChunk;

const mapFlattened = <T, U>(
  itemsArray: T[][],
  map: (items: T[]) => U[],
): U[][] => {
  const indexedItems = flatten(
    itemsArray.map((items, index) => items.map(item => ({ item, index }))),
  );
  return map(indexedItems.map(({ item }) => item)).reduce(
    (res, v, i) => {
      res[indexedItems[i].index] = [...(res[indexedItems[i].index] || []), v];
      return res;
    },
    [] as U[][],
  );
};

const mapGroups = <T, U, V>(
  items: T[],
  groupBy: (item: T) => U,
  map: (items: T[], value: U) => V[],
): V[] => {
  const hashMap = {} as Obj<U>;
  const groups: Obj<{ item: T; index: number }[]> = {};
  for (const [index, item] of items.entries()) {
    const value = groupBy(item);
    const h = hash(value);
    hashMap[h] = value;
    groups[h] = [...(groups[h] || []), { item, index }];
  }
  return flatten(
    Object.keys(groups).map(h =>
      map(groups[h].map(v => v.item), hashMap[h]).map((result, i) => ({
        result,
        index: groups[h][i].index,
      })),
    ),
  ).reduce<V[]>((res, { result, index }) => {
    res[index] = result;
    return res;
  }, []);
};

const mapSetGroups = <T, U, V>(
  items: T[],
  groupBy: (item: T) => U[],
  map: (items: T[], values: U[]) => V[],
): V[][] => {
  const hashMap = {} as Obj<U>;
  const indicesMap: Obj<number[]> = {};
  for (const [index, item] of items.entries()) {
    for (const value of groupBy(item)) {
      const h = hash(value);
      hashMap[h] = value;
      indicesMap[h] = [...(indicesMap[h] || []), index];
    }
  }
  const groups: Obj<U[]> = {};
  for (const h of Object.keys(indicesMap)) {
    const key = indicesMap[h].sort((a, b) => a - b).join('.');
    groups[key] = [...(groups[key] || []), hashMap[h]];
  }
  return flatten(
    Object.keys(groups).map(key => {
      const indexedItems = key
        .split('.')
        .map(i => parseInt(i, 10))
        .map(index => ({ item: items[index], index }));
      return map(indexedItems.map(v => v.item), groups[key]).map(
        (result, i) => ({
          result,
          index: indexedItems[i].index,
        }),
      );
    }),
  ).reduce<V[][]>((res, { result, index }) => {
    res[index] = [...(res[index] || []), result];
    return res;
  }, []);
};

const getSplitSlices = (slices: Slice[]): Slice[][] => {
  const sliceValues = [
    ...Array.from(
      new Set(
        flatten(
          slices.map(s => [s.start, ...(s.end !== undefined ? [s.end] : [])]),
        ),
      ),
    ).sort((a, b) => a - b),
    undefined,
  ];
  return slices.map(slice => {
    const startIndex = sliceValues.indexOf(slice.start);
    const endIndex =
      slice.end === undefined
        ? sliceValues.length - 1
        : sliceValues.indexOf(slice.end);
    return Array.from({ length: endIndex - startIndex }).map((_, i) => ({
      start: sliceValues[i + startIndex]!,
      end: sliceValues[i + startIndex + 1],
    }));
  });
};

const getChunks = (
  schema: Schema,
  searchesArray: Search[][],
  dataArray: DataState[] | null,
): Chunk[][] =>
  mapFlattened(
    searchesArray.map((searches, i) =>
      searches.map(search => ({ ...search, data: dataArray && dataArray[i] })),
    ),
    allSearches =>
      mapGroups(
        allSearches.map(s => ({
          ...s,
          sort: s.sort || [{ field: ['id'], direction: 'ASC' as 'ASC' }],
          slice: s.slice || { start: 0 },
        })),
        s => s.store,
        (storeSearches, store) => {
          const chunks = getChunks(
            schema,
            storeSearches.map(
              s => s.fields.filter(f => !Array.isArray(f)) as Search[],
            ),
            dataArray && storeSearches.map(s => s.data!),
          );
          return mapSetGroups(
            storeSearches.map((s, i) => ({
              ...s,
              fields: [
                ...(s.fields.filter(f => Array.isArray(f)) as FieldPath[]).map(
                  f => f.join('.'),
                ),
                ...(chunks[i] || []),
              ],
            })),
            s => s.fields,
            (fieldSearches, allFields) => {
              const fields = {
                fields: getNestedFields(
                  (allFields.filter(f => !Array.isArray(f)) as string[]).map(
                    f => f.split('.'),
                  ),
                ),
                chunks: allFields.filter(f => Array.isArray(f)) as Chunk[],
              };
              const splitFilters = getSplitFilters(
                fieldSearches.map(s => s.filter),
              );
              return mapFlattened(
                fieldSearches.map(
                  (s, i) =>
                    s.slice.start !== 0 || s.slice.end !== undefined
                      ? [{ ...s, splitFilter: splitFilters[i] }]
                      : splitFilters[i].map(f => ({ ...s, splitFilter: [f] })),
                ),
                allFilterSearches =>
                  mapSetGroups(
                    allFilterSearches,
                    s => s.splitFilter,
                    (filterSearches, filter) =>
                      mapGroups(
                        filterSearches,
                        s => s.sort,
                        (sortSearches, sort) => {
                          const splitSlices = getSplitSlices(
                            sortSearches.map(
                              s =>
                                s.data
                                  ? getSliceExtra(
                                      schema,
                                      s.data,
                                      store,
                                      filter,
                                      s.slice,
                                    )
                                  : s.slice,
                            ),
                          );
                          return mapSetGroups(
                            sortSearches.map((s, i) => ({
                              ...s,
                              slice: splitSlices[i],
                            })),
                            s => s.slice,
                            (sliceSearches, slices) =>
                              sliceSearches.map(() => ({
                                store,
                                filter,
                                sort,
                                slices,
                                ...fields,
                              })),
                          ).map(
                            (res, i) =>
                              sortSearches[i].slice.start === 0
                                ? res
                                : [
                                    ...res,
                                    {
                                      store,
                                      filter,
                                      sort,
                                      slice: {
                                        key: hash(
                                          sortSearches[i].filter || null,
                                        ),
                                        index: sortSearches[i].slice.start,
                                      },
                                    },
                                  ],
                          );
                        },
                      ),
                  ),
              );
            },
          );
        },
      ).map((v, i) =>
        flatten(flatten(flatten(v))).map(
          x => ({ name: allSearches[i].name, ...x } as Chunk),
        ),
      ),
  ).map(v => flatten(v));

const nullIfEmpty = <T>(items: T[]) => (items.length === 0 ? null : items);

const groupItems = <T, U, V>(
  items: T[],
  groupBy: (item: T) => U,
  map: (items: T[], value: U) => V | null,
): [U, V][] | null => {
  const hashMap = {} as Obj<U>;
  const groups: Obj<T[]> = {};
  for (const item of items) {
    const value = groupBy(item);
    const h = hash(value);
    hashMap[h] = value;
    groups[h] = [...(groups[h] || []), item];
  }
  return nullIfEmpty(Object.keys(groups)
    .map(h => [hashMap[h], map(groups[h], hashMap[h])])
    .filter(v => v[1] !== null) as [U, V][]);
};

const getNewRequests = (chunks: Chunk[], newChunks: Chunk[]): Requests | null =>
  groupItems(
    [
      ...chunks.map(chunk => ({ chunk, isNew: false })),
      ...newChunks.map(chunk => ({ chunk, isNew: true })),
    ],
    s => s.chunk.store,
    storeSearches =>
      groupItems(
        storeSearches,
        s => s.chunk.filter,
        filterSearches =>
          groupItems(
            filterSearches,
            s => s.chunk.sort,
            sortSearches => {
              const slicePairs = groupItems(
                sortSearches,
                s => s.chunk.slice,
                (sliceSearches, slices) => {
                  if (!Array.isArray(slices)) {
                    return sliceSearches.every(s => s.isNew) ? true : null;
                  }
                  const fields = groupItems(
                    sliceSearches,
                    s => ({
                      fields: (s.chunk as any).fields as NestedFields,
                      chunks: (s.chunk as any).chunks as Chunk[],
                    }),
                    fieldsSearches => fieldsSearches.every(s => s.isNew),
                  )!;
                  const result = {
                    fields: fields.reduce<NestedFields>(
                      (res, f) => (f[1] ? merge(res, f[0].fields) : res),
                      {},
                    ),
                    requests:
                      getNewRequests(
                        flatten(
                          fields.filter(f => !f[1]).map(f => f[0].chunks),
                        ),
                        flatten(fields.filter(f => f[1]).map(f => f[0].chunks)),
                      ) || [],
                  };
                  return Object.keys(result.fields).length !== 0 ||
                    result.requests.length !== 0
                    ? result
                    : null;
                },
              );
              return (
                slicePairs &&
                slicePairs.map(
                  ([key, values]) =>
                    Array.isArray(key)
                      ? ([key, values] as [
                          Slice[],
                          { fields: NestedFields; requests: Requests }
                        ])
                      : key,
                )
              );
            },
          ),
      ),
  );

export const getSearchesRequests = (
  { schema, queries, data }: State,
  newSearches: Search[],
) => {
  const searches = flatten(queries.map(q => q.searches));
  const [splitSearches, newSplitSearches] = getChunks(
    schema,
    [searches, newSearches],
    [data, data],
  );
  return getNewRequests(splitSearches, newSplitSearches);
};

export const getUpdateRequests = (
  { schema, queries, data }: State,
  newData: DataState,
) => {
  const searches = flatten(queries.map(q => q.searches));
  const [splitSearches, newSplitSearches] = getChunks(
    schema,
    [searches, searches],
    [data, newData],
  );
  return getNewRequests(splitSearches, newSplitSearches);
};
