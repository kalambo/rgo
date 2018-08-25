import { getSplitFilters } from './filters';
import { FieldPath, Obj, Search, Slice } from './typings';
import { flatten, hash } from './utils';

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

const getSplitSlices = (slicesArray: Slice[][]): Slice[][] => {
  const sliceValues = [
    ...Array.from(
      new Set(
        flatten(
          flatten(slicesArray).map(s => [
            s.start,
            ...(s.end !== undefined ? [s.end] : []),
          ]),
        ),
      ),
    ).sort((a, b) => a - b),
    undefined,
  ];
  return slicesArray.map(slices =>
    flatten(
      slices.map(slice => {
        const startIndex = sliceValues.indexOf(slice.start);
        const endIndex =
          slice.end === undefined
            ? sliceValues.length - 1
            : sliceValues.indexOf(slice.end);
        return Array.from({ length: endIndex - startIndex }).map((_, i) => ({
          start: sliceValues[i + startIndex]!,
          end: sliceValues[i + startIndex + 1],
        }));
      }),
    ),
  );
};

interface NewSearch extends Search {
  searches: NewSearch[];
  isNew: boolean;
}

const getSplitSearches = (
  searchesArray: (Search & { isNew: boolean })[][],
): NewSearch[][] =>
  mapFlattened(searchesArray, allSearches =>
    mapGroups(
      allSearches,
      s => s.store,
      (storeSearches, store) => {
        const splitSearches = getSplitSearches(
          storeSearches.map(({ searches, isNew }) =>
            searches.map(s => ({ ...s, isNew })),
          ),
        );
        return mapSetGroups(
          storeSearches.map((s, i) => ({
            ...s,
            fields: [...s.fields, ...(splitSearches[i] || [])],
          })),
          s => s.fields,
          (fieldSearches, allFields) => {
            const fields = {
              fields: allFields.filter(f => Array.isArray(f)) as FieldPath[],
              searches: allFields.filter(f => !Array.isArray(f)) as NewSearch[],
            };
            const splitFilters = getSplitFilters(
              fieldSearches.map(s => s.filter),
            );
            const filterInfo = fieldSearches.map((s, index) => ({
              filters: splitFilters[index],
              hashes: splitFilters[index].map(hash),
              hasSlice:
                s.slice.length > 1 ||
                (s.slice[0].start !== 0 || s.slice[0].end !== undefined),
              index,
            }));
            return mapFlattened(
              fieldSearches.map((s, i) => {
                if (filterInfo[i].hasSlice) {
                  return [{ ...s, splitFilter: splitFilters[i] }];
                }
                const groups = filterInfo.filter(
                  ({ hashes, hasSlice }) =>
                    hasSlice &&
                    hashes.every(h => filterInfo[i].hashes.includes(h)),
                );
                return [
                  ...groups.map(({ filters }) => ({
                    ...s,
                    splitFilter: filters,
                  })),
                  ...splitFilters[i]
                    .filter((_, j) =>
                      groups.every(
                        ({ hashes }) =>
                          !hashes.includes(filterInfo[i].hashes[j]),
                      ),
                    )
                    .map(filter => ({ ...s, splitFilter: [filter] })),
                ];
              }),
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
                          sortSearches.map(s => s.slice),
                        );
                        return mapSetGroups(
                          sortSearches.map((s, i) => ({
                            ...s,
                            slice: splitSlices[i],
                          })),
                          s => s.slice,
                          (sliceSearches, slice) =>
                            sliceSearches.map(() => ({
                              store,
                              filter,
                              sort,
                              slice,
                              ...fields,
                              isNew: sliceSearches.every(s => s.isNew),
                            })),
                        );
                      },
                    ),
                ),
            );
          },
        );
      },
    ),
  ).map(v => flatten(flatten(flatten(flatten(v)))));

const cleanSearches = (searches: NewSearch[]): Search[] =>
  searches
    .map(s => {
      if (!s.isNew) return null;
      const nextSearches = cleanSearches(s.searches);
      if (s.fields.length > 0 || nextSearches.length > 0) {
        return { ...s, searches: nextSearches };
      }
      return null;
    })
    .filter(s => s) as Search[];

export const getNewSearches = (
  searches: Search[],
  newSearches: Search[],
): Search[] =>
  cleanSearches(
    getSplitSearches([
      searches.map(s => ({ ...s, isNew: false })),
      newSearches.map(s => ({ ...s, isNew: true })),
    ])[1],
  );
