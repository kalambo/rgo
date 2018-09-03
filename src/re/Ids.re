open Belt;
open Types;
open Utils;
open Data;

let getFilterValues =
    (
      schema: schema,
      data: data,
      store: string,
      id: string,
      value: option(value),
      fields: array(string),
    ) =>
  switch (
    Array.concat(
      switch (value) {
      | Some(value) => [|value|]
      | None => [||]
      },
      fields
      |. Array.map(field =>
           switch (getDataValue(schema, data, store, id, field)) {
           | Some(SingleValue(value)) => [|value|]
           | Some(ArrayValue(values)) => values
           | None => raise(Not_found)
           }
         )
      |. Array.concatMany,
    )
  ) {
  | [||] => [|Null|]
  | values => values
  };

let setFilterVariables =
    (schema: schema, data: data, store: string, id: string, filter: filter) =>
  filter
  |. Array.map(filterMap =>
       filterMap
       |. Array.map(((field, range)) =>
            (
              field,
              switch (range) {
              | FilterPoint({value, fields}) =>
                switch (
                  unique(
                    getFilterValues(schema, data, store, id, value, fields),
                  )
                ) {
                | [|value|] =>
                  FilterPoint({value: Some(value), fields: [||]})
                | _ => raise(Not_found)
                }
              | FilterRange(
                  {value: startValue, fields: startFields},
                  {value: endValue, fields: endFields},
                ) =>
                FilterRange(
                  {
                    value:
                      switch (
                        take(
                          getFilterValues(
                            schema,
                            data,
                            store,
                            id,
                            startValue,
                            startFields,
                          ),
                        )
                      ) {
                      | None => raise(Not_found)
                      | Some((value, values)) =>
                        values
                        |. Array.reduce(value, (value1, value2) =>
                             compareDirectionValues(
                               LowValue(Some(value1)),
                               LowValue(Some(value2)),
                             )
                             == (-1) ?
                               value1 : value2
                           )
                        |. Some
                      },
                    fields: [||],
                  },
                  {
                    value:
                      switch (
                        take(
                          getFilterValues(
                            schema,
                            data,
                            store,
                            id,
                            endValue,
                            endFields,
                          ),
                        )
                      ) {
                      | None => raise(Not_found)
                      | Some((value, values)) =>
                        values
                        |. Array.reduce(value, (value1, value2) =>
                             compareDirectionValues(
                               HighValue(Some(value1)),
                               HighValue(Some(value2)),
                             )
                             == (-1) ?
                               value1 : value2
                           )
                        |. Some
                      },
                    fields: [||],
                  },
                )
              },
            )
          )
     );

let getRanges =
    (
      ranges: keyMap(array(ranges)),
      store: string,
      filter: filter,
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
        |. Array.some(rangeFilter => containsAll(rangeFilter, filter))) {
      [|(RangeFirst, None)|];
    } else {
      ranges
      |. Array.keepMap(range =>
           switch (range) {
           | PartialRange(rangeFilter, rangeSort, ranges) =>
             rangeFilter == filter && rangeSort == sort ? Some(ranges) : None
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
      | None => variableFilter
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