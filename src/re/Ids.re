open Belt;
open Types;
open Utils;
open Data;
open Filters;

let getFilterValue =
    (
      schema: schema,
      data: data,
      store: string,
      id: string,
      value: filterVariable,
    ) =>
  switch (value) {
  | FilterValue(value) => value
  | FilterVariable(field) =>
    switch (getDataValue(schema, data, store, id, field)) {
    | Some(SingleValue(value)) => value
    | _ => raise(Not_found)
    }
  };

let rec setFilterVariables =
        (
          schema: schema,
          data: data,
          store: string,
          id: string,
          filter: filter(filterVariable),
        ) =>
  switch (filter) {
  | FilterOr(filters) =>
    FilterOr(
      filters
      |. Array.map(filter =>
           setFilterVariables(schema, data, store, id, filter)
         ),
    )
  | FilterAnd(filters) =>
    FilterAnd(
      filters
      |. Array.map(filter =>
           setFilterVariables(schema, data, store, id, filter)
         ),
    )
  | FilterIn(field, values) =>
    FilterIn(
      field,
      values
      |. Array.map(value => getFilterValue(schema, data, store, id, value)),
    )
  | Filter(field, operation, value) =>
    Filter(field, operation, getFilterValue(schema, data, store, id, value))
  };

let compareFilters = (filter1, filter2) => {
  let filterMaps1 =
    filterToMap(filter1, value => {value: Some(value), fields: [||]});
  let filterMaps2 =
    filterToMap(filter2, value => {value: Some(value), fields: [||]});
  switch (getSplitFilters([|filterMaps1, filterMaps2|])) {
  | [|splitMaps1, splitMaps2|] =>
    containsAll(splitMaps1, splitMaps2) ?
      Array.length(splitMaps1) == Array.length(splitMaps2) ? 0 : 1 : (-1)
  | _ => raise(Not_found)
  };
};

let getRanges =
    (
      ranges: keyMap(array(ranges)),
      store: string,
      filter: filter(value),
      sort: sort,
    ) =>
  switch (ranges |. get(store)) {
  | Some(ranges) =>
    if (ranges
        |. Array.keepMap(range =>
             switch (range) {
             | FullRange(rangeFilter) => Some(rangeFilter)
             | PartialRange(_, _, _) => None
             }
           )
        |. Array.some(rangeFilter => compareFilters(rangeFilter, filter) == 1)) {
      [|(RangeFirst, None)|];
    } else {
      ranges
      |. Array.keepMap(range =>
           switch (range) {
           | PartialRange(rangeFilter, rangeSort, ranges) =>
             compareFilters(rangeFilter, filter) == 0 && rangeSort == sort ?
               Some(ranges) : None
           | FullRange(_) => None
           }
         )
      |. Array.concatMany;
    }
  | None => [||]
  };

let getSearchIds =
    (
      schema: schema,
      data: dataState,
      {store, filter: variableFilter, sort, slices}: search,
      parent: option((string, string)),
    ) =>
  switch (slices) {
  | [|(sliceStart, sliceEnd)|] =>
    let filter =
      switch (parent) {
      | Some((parentStore, parentId)) =>
        setFilterVariables(
          schema,
          mergeNullData(data.server, data.client),
          parentStore,
          parentId,
          variableFilter,
        )
      | None =>
        setFilterVariables(
          schema,
          mergeNullData(data.server, data.client),
          "",
          "",
          variableFilter,
        )
      };
    let ranges = getRanges(data.ranges, store, filter, sort);
    if (Array.length(ranges) == 0) {
      None;
    } else {
      let (changes, (serverIds, combinedIds)) =
        getDataChanges(schema, data.server, data.client, store, filter, sort);
      let mappedRanges =
        applyDataChanges(
          changes,
          ranges
          |. Array.map(((rangeStart, rangeLength)) =>
               switch (rangeStart) {
               | RangeFirst => (0, 0, rangeLength)
               | RangeIndex(rangeIndex, rangeId) => (
                   must(indexOf(serverIds, rangeId)),
                   rangeIndex,
                   rangeLength,
                 )
               }
             ),
          ((combinedIndex, rangeIndex, length), index, change) => (
            index < combinedIndex ? combinedIndex + change : combinedIndex,
            index < combinedIndex ? rangeIndex + change : rangeIndex,
            switch (length) {
            | Some(length)
                when combinedIndex <= index && index < combinedIndex + length =>
              Some(length + change)
            | rangeLength => rangeLength
            },
          ),
          false,
        );
      let (ids, gaps, _) =
        mappedRanges
        |. Array.reduce(
             ([||], [||], 0),
             (
               (ids, gaps, prevCombinedIndex),
               (combinedIndex, rangeIndex, length),
             ) => {
               let gapStart = sliceStart + Array.length(ids);
               let gap =
                 slice(
                   [||],
                   gapStart,
                   Some(
                     switch (sliceEnd) {
                     | Some(sliceEnd) => min(rangeIndex, sliceEnd)
                     | None => rangeIndex
                     },
                   ),
                 );
               (
                 Array.concatMany([|
                   ids,
                   gap,
                   slice(
                     combinedIds,
                     max(combinedIndex, sliceStart),
                     switch (length, sliceEnd) {
                     | (Some(length), Some(sliceEnd)) =>
                       Some(min(combinedIndex + length, sliceEnd))
                     | (Some(length), None) => Some(combinedIndex + length)
                     | (None, Some(sliceEnd)) => Some(sliceEnd)
                     | (None, None) => None
                     },
                   ),
                 |]),
                 Array.length(gap) == 0 ?
                   gaps :
                   Array.concat(
                     [|
                       (
                         gapStart,
                         Some(Array.length(gap)),
                         prevCombinedIndex,
                         Some(combinedIndex - prevCombinedIndex),
                       ),
                     |],
                     gaps,
                   ),
                 switch (length) {
                 | Some(length) => combinedIndex + length
                 | None => 0
                 },
               );
             },
           );
      let mappedGaps =
        applyDataChanges(
          changes,
          switch (sliceEnd, mappedRanges[Array.length(mappedRanges) - 1]) {
          | (_, None) => raise(Not_found)
          | (None, Some((combinedIndex, rangeIndex, Some(rangeLength)))) =>
            Array.concat(
              [|
                (
                  rangeIndex + rangeLength,
                  None,
                  combinedIndex + rangeLength,
                  None,
                ),
              |],
              gaps,
            )
          | (
              Some(sliceEnd),
              Some((combinedIndex, rangeIndex, Some(rangeLength))),
            )
              when rangeIndex + rangeLength < sliceEnd =>
            Array.concat(
              [|
                (
                  rangeIndex + rangeLength,
                  Some(sliceEnd - rangeIndex - rangeLength),
                  combinedIndex + rangeLength,
                  None,
                ),
              |],
              gaps,
            )
          | _ => gaps
          },
          (
            (gapStart, gapLength, combinedStart, combinedLength),
            index,
            change,
          ) => (
            index < combinedStart ? gapStart + change : gapStart,
            switch (gapLength, combinedLength) {
            | (Some(gapLength), Some(combinedLength))
                when
                  combinedStart <= index
                  && index < combinedStart
                  + combinedLength =>
              Some(gapLength + change)
            | (gapLength, _) => gapLength
            },
            index < combinedStart ? combinedStart + change : combinedStart,
            switch (combinedLength) {
            | Some(combinedLength)
                when combinedStart <= index && index < combinedStart =>
              Some(combinedLength + change)
            | rangeLength => rangeLength
            },
          ),
          true,
        )
        |. Array.map(((gapStart, gapLength, _, _)) =>
             switch (gapLength) {
             | Some(gapLength) => (gapStart, Some(gapStart + gapLength))
             | None => (gapStart, None)
             }
           );
      Some((ids, mappedGaps |. emptyToNone));
    };
  | _ => raise(Not_found)
  };