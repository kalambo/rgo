import keysToObject from 'keys-to-object';

import { compareIds, getCombinedData, idInFilter, sortIds } from './data';
import { compareFilters, setFilterVariables } from './filters';
import {
  Data,
  DataState,
  Filter,
  Range,
  Schema,
  Search,
  Slice,
  State,
} from './typings';
import { flatten, locationOf, merge } from './utils';

const getRanges = (
  data: DataState,
  store: string,
  filter: Filter,
  slice: Slice,
): Range[] => {
  if (slice.start !== 0 || slice.end !== undefined) {
    const range = (data.ranges[store] || []).find(
      r => compareFilters(r.filter, filter) === 0,
    );
    return range ? range.ranges : [];
  }
  return (data.ranges[store] || []).some(
    r =>
      r.ranges.length === 1 &&
      r.ranges[0].start === 0 &&
      r.ranges[0].end === undefined &&
      ([0, 1] as (number | null)[]).includes(compareFilters(r.filter, filter)),
  )
    ? [{ start: 0 }]
    : [];
};

export const getIdsAndGaps = (
  schema: Schema,
  data: DataState,
  { store, filter: variableFilter, sort, slice: [slice] }: Search,
  prevStore: string | null,
  prevId: string | null,
) => {
  const filter = prevStore
    ? setFilterVariables(schema, data, prevStore, prevId!, variableFilter)
    : variableFilter;

  const ranges = getRanges(data, store, filter, slice);

  if (ranges.length === 0) return null;

  const allServerIds = Object.keys(data.server[store]);
  const filteredServerIds = allServerIds.filter(id =>
    idInFilter(schema, data.server, store, id, filter),
  );
  const sortedServerIds = sortIds(
    schema,
    data.server,
    store,
    filteredServerIds,
    sort,
  );

  let current = 0;
  const serverIds: (string | undefined)[] = [];
  for (const range of ranges) {
    serverIds.push(
      ...Array.from<string | undefined>({ length: range.start - current }).fill(
        undefined,
      ),
    );
    const start = range.id ? sortedServerIds.indexOf(range.id) : 0;
    const end =
      range.end === undefined ? undefined : start + range.end - range.start;
    serverIds.push(...sortedServerIds.slice(start, end));
    current = end!;
  }

  const combinedIds = [...serverIds];
  const idChanges: {
    type: 'added' | 'removed';
    id: string;
    index: number;
  }[] = [];
  const combined = getCombinedData(data);
  const compare = compareIds(schema, combined, store, sort);
  for (const id of Object.keys(data.client[store] || {})) {
    const index = combinedIds.indexOf(id);
    if (index !== -1) {
      idChanges.push({ type: 'removed', id, index });
      combinedIds.splice(index, 1);
    }
    if (
      data.client[store][id] !== null &&
      idInFilter(schema, combined, store, id, filter)
    ) {
      const newIndex = locationOf(
        id,
        combinedIds,
        (id1, id2) =>
          id1 === undefined ? 1 : id2 === undefined ? -1 : compare(id1, id2),
      );
      idChanges.push({ type: 'added', id, index: newIndex });
      combinedIds.splice(newIndex, 0, id);
    }
  }

  const mappedRanges = ranges.map(range => {
    const res = { ...range };
    for (const { type, index } of idChanges) {
      if (index < res.start) {
        res.start += type === 'added' ? 1 : -1;
      }
      if (res.end !== undefined && index < res.end) {
        res.end += type === 'added' ? 1 : -1;
      }
    }
    return res;
  });

  current = slice.start;
  const result: (string | undefined)[] = [];
  const gaps: { start: number; end?: number }[] = [];
  for (const range of mappedRanges) {
    if (slice.end === undefined || range.start < slice.end) {
      if (range.start > current) {
        gaps.push({ start: current, end: range.start });
        result.push(
          ...Array.from<string | undefined>({
            length: range.start - current,
          }).fill(undefined),
        );
      }
      current = range.start;
      result.push(
        ...combinedIds.slice(
          current,
          slice.end === undefined
            ? range.end
            : range.end === undefined
              ? slice.end
              : Math.min(slice.end, range.end),
        ),
      );
      current = range.end!;
    }
  }
  if (slice.end === undefined) {
    if (current !== undefined) gaps.push({ start: current });
  } else {
    if (current < slice.end) gaps.push({ start: current, end: slice.end });
  }

  const mappedGaps = gaps.map(gap => {
    const res = { ...gap };
    for (const { type, index } of idChanges.reverse()) {
      if (index < res.start) {
        res.start += type === 'added' ? -1 : 1;
      }
      if (res.end !== undefined && index < res.end) {
        res.end += type === 'added' ? -1 : 1;
      }
    }
    return res;
  });

  return { ids: result, gaps: mappedGaps };
};

export const updateRanges = ({ schema, data }: State, newData: Data) => {
  const combined = merge(data.server, newData);
  return keysToObject(Object.keys(newData), store =>
    data.ranges[store].map(({ filter, sort, ranges }) => {
      let result = ranges;
      for (const id of Object.keys(newData[store])) {
        if (idInFilter(schema, data.server, store, id, filter)) {
          const ids = sortIds(
            schema,
            data.server,
            store,
            Object.keys(data.server[store]).filter(id =>
              idInFilter(schema, data.server, store, id, filter),
            ),
            sort,
          );
          const index = ids.indexOf(id);
          result = flatten(
            result.map(range => {
              const start = ids.indexOf(range.id!);
              const end =
                range.end === undefined
                  ? undefined
                  : start + range.end - range.start;
              if (index < start) {
                return [{ ...range, start: range.start - 1 }];
              }
              if (start <= index && (end === undefined || index < end)) {
                return [
                  { ...range, end: index - start },
                  { ...range, id: ids[index + 1], start: index - start + 1 },
                ];
              }
              return [range];
            }),
          );
        }
        if (idInFilter(schema, combined, store, id, filter)) {
          const ids = sortIds(
            schema,
            combined,
            store,
            Object.keys(combined[store]).filter(id =>
              idInFilter(schema, combined, store, id, filter),
            ),
            sort,
          );
          const index = ids.indexOf(id);
          result = result.map(range => {
            const start = ids.indexOf(range.id!);
            const end =
              range.end === undefined
                ? undefined
                : start + range.end - range.start;
            if (index < start) {
              return { ...range, start: range.start + 1 };
            }
            if (start <= index && end !== undefined && index < end) {
              return { ...range, end: range.end! + 1 };
            }
            return range;
          });
        }
      }
      return { filter, sort, ranges };
    }),
  );
};
