import { Obj, Requests, Search } from './typings';
import { flatten, hash, nestedFields } from './utils';

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

export const buildRequests = (searches: Search[]): Requests | null =>
  groupItems(
    searches,
    s => s.store,
    storeSearches =>
      groupItems(
        storeSearches,
        s => s.filter,
        filterSearches =>
          groupItems(
            filterSearches,
            s => s.sort,
            sortSearches =>
              groupItems(
                sortSearches,
                s => s.slice,
                sliceSearches => {
                  const result = {
                    fields: nestedFields(
                      flatten(sliceSearches.map(s => s.fields)),
                    ),
                    requests:
                      buildRequests(
                        flatten(sliceSearches.map(s => s.searches)),
                      ) || [],
                  };
                  if (
                    Object.keys(result.fields).length === 0 &&
                    result.requests.length === 0
                  ) {
                    return null;
                  }
                  return result;
                },
              ),
          ),
      ),
  );
