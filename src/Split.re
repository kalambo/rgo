open Belt;
open Types;
open Utils;
open Data;

type newSearch = {
  store: string,
  filter,
  sort,
  slices: list(slice),
  fields: list(fieldPath),
  searches: list(newSearch),
  isNew: bool,
};

let getFilterValues = (filters: list(filter)) =>
  filters
  |. List.flatten
  |. List.reduce(Map.make(~id=(module FieldCmp)), (valuesMap, filterMap) =>
       Map.merge(valuesMap, filterMap, (_, values, range) =>
         unique(
           List.concat(
             switch (values) {
             | Some(values) => values
             | None => [LowValue(None), HighValue(None)]
             },
             switch (range) {
             | Some(FilterPoint({value, fields})) =>
               List.length(fields) == 0 ? [LowValue(value)] : []
             | Some(
                 FilterRange(
                   {value: startValue, fields: startFields},
                   {value: endValue, fields: endFields},
                 ),
               ) =>
               List.length(startFields) == 0 && List.length(endFields) == 0 ?
                 [LowValue(startValue), HighValue(endValue)] : []
             | None => []
             },
           ),
         )
         |. List.sort(compareDirectionValues)
         |. Some
       )
     );

let splitFilterMap =
    (
      filterMap: filterMap,
      values:
        Belt.Map.t(
          Rgo.Types.FieldCmp.t,
          Belt.List.t(Rgo.Types.directionValue),
          Rgo.Types.FieldCmp.identity,
        ),
    ) =>
  values
  |. Map.reduce([filterMap], (filterMaps, field, values) =>
       filterMaps
       |. List.map(filterMap =>
            switch (
              switch (Map.get(filterMap, field)) {
              | Some(range) => range
              | None =>
                FilterRange(
                  {value: None, fields: []},
                  {value: None, fields: []},
                )
              }
            ) {
            | FilterPoint(_) => [filterMap]
            | FilterRange({fields: startFields}, {fields: endFields})
                when
                  List.length(startFields) != 0
                  || List.length(endFields) != 0 => [
                filterMap,
              ]
            | FilterRange({value: startValue}, {value: endValue}) =>
              List.mapWithIndex(
                values,
                (
                  index,
                  (LowValue(value) | HighValue(value)) as directionValue,
                ) =>
                switch (
                  compareDirectionValues(
                    directionValue,
                    LowValue(startValue),
                  ),
                  compareDirectionValues(
                    directionValue,
                    HighValue(endValue),
                  ),
                  List.get(values, index + 1),
                ) {
                | (
                    cmp1,
                    cmp2,
                    Some(LowValue(nextValue) | HighValue(nextValue)),
                  )
                    when cmp1 != (-1) && cmp2 != 1 =>
                  List.concat(
                    [
                      FilterRange(
                        {value, fields: []},
                        {value: nextValue, fields: []},
                      ),
                    ],
                    cmp2 == (-1) ?
                      [
                        FilterRange(
                          {value: nextValue, fields: []},
                          {value: nextValue, fields: []},
                        ),
                      ] :
                      [],
                  )
                | _ => []
                }
              )
              |. List.flatten
              |. List.map(range => Map.set(filterMap, field, range))
            }
          )
       |. List.flatten
     );

let getSplitFilters = (filters: list(filter)) => {
  let values = getFilterValues(filters);
  filters
  |. List.map(filter =>
       filter
       |. List.map(filterMap => splitFilterMap(filterMap, values))
       |. List.flatten
       |. List.sort(compare)
     );
};

let getFilterSearches = (searches: list(newSearch)) => {
  let splitSearches =
    List.zip(
      searches,
      searches |. List.map(search => search.filter) |. getSplitFilters,
    )
    |. List.map(((search, filter)) => {...search, filter});
  splitSearches
  |. List.map(search =>
       search.slices == [(0, None)] ?
         [search] :
         {
           let coveredFilters =
             splitSearches
             |. List.keepMap(({filter, slices}) =>
                  slices != [(0, None)]
                  && listContainsAll(search.filter, filter) ?
                    Some(filter) : None
                );
           List.concat(
             coveredFilters |. List.map(filter => {...search, filter}),
             search.filter
             |. List.keepMap(filterMap =>
                  coveredFilters
                  |. List.flatten
                  |. List.every(f => f != filterMap) ?
                    Some({...search, filter: [filterMap]}) : None
                ),
           );
         }
     );
};

let getSplitSlices = (slicesArray: list(list(slice))) => {
  let values =
    List.concat(
      unique(
        slicesArray
        |. List.map(slices =>
             slices
             |. List.map(slice =>
                  switch (slice) {
                  | (startValue, Some(endValue)) => [
                      Some(startValue),
                      Some(endValue),
                    ]
                  | (startValue, None) => [Some(startValue)]
                  }
                )
           )
        |. List.flatten
        |. List.flatten,
      )
      |. List.sort(compare),
      [None],
    );
  slicesArray
  |. List.map(slices =>
       slices
       |. List.map(((sliceStart, sliceEnd)) =>
            values
            |. List.mapWithIndex((index, value1) =>
                 switch (sliceEnd, value1, List.get(values, index + 1)) {
                 | (_, None, _)
                 | (_, _, None) => None
                 | (Some(sliceEnd), Some(value1), Some(value2)) =>
                   value1 >= sliceStart && value1 < sliceEnd ?
                     Some((value1, value2)) : None
                 | (None, Some(value1), Some(value2)) =>
                   value1 >= sliceStart ? Some((value1, value2)) : None
                 }
               )
            |. List.keepMap(v => v)
          )
     )
  |. List.flatten;
};

type splitField =
  | SplitField(fieldPath)
  | SplitSearch(newSearch);

let rec getSplitSearches =
        (searchesArray: list(list((search, bool))))
        : list(list(newSearch)) =>
  searchesArray
  |. mapFlattened(allSearches =>
       allSearches
       |. mapGroups(
            ((search, _)) => search.store,
            (storeSearches, store) =>
              List.zip(
                storeSearches,
                storeSearches
                |. List.map(((search, isNew)) =>
                     search.searches |. List.map(s => (s, isNew))
                   )
                |. getSplitSearches,
              )
              |. List.map(
                   (
                     (
                       ({store, filter, sort, slices, fields}, isNew),
                       searches,
                     ),
                   ) =>
                   {store, filter, sort, slices, fields, searches, isNew}
                 )
              |. mapListGroups(
                   ({fields, searches}) =>
                     List.concat(
                       fields |. List.map(field => SplitField(field)),
                       searches |. List.map(search => SplitSearch(search)),
                     ),
                   (fieldSearches, allFields) => {
                     let fields =
                       allFields
                       |. List.keepMap(field =>
                            switch (field) {
                            | SplitField(field) => Some(field)
                            | SplitSearch(_) => None
                            }
                          );
                     let searches =
                       allFields
                       |. List.keepMap(field =>
                            switch (field) {
                            | SplitSearch(search) => Some(search)
                            | SplitField(_) => None
                            }
                          );
                     fieldSearches
                     |. getFilterSearches
                     |. mapFlattened(allFilterSearches =>
                          allFilterSearches
                          |. mapListGroups(
                               search => search.filter,
                               (filterSearches, filter) =>
                                 filterSearches
                                 |. mapGroups(
                                      search => search.sort,
                                      (sortSearches, sort) =>
                                        List.zip(
                                          sortSearches,
                                          sortSearches
                                          |. List.map(search => search.slices)
                                          |. getSplitSlices,
                                        )
                                        |. List.map(((search, slices)) =>
                                             {...search, slices}
                                           )
                                        |. mapListGroups(
                                             search => search.slices,
                                             (sliceSearches, slices) => [
                                               {
                                                 store,
                                                 filter,
                                                 sort,
                                                 slices,
                                                 fields,
                                                 searches,
                                                 isNew:
                                                   sliceSearches
                                                   |. List.every(s => s.isNew),
                                               },
                                             ],
                                           ),
                                    ),
                             )
                        );
                   },
                 ),
          )
     )
  |. List.map(v =>
       v |. List.flatten |. List.flatten |. List.flatten |. List.flatten
     );

let rec cleanSearches = (searches: list(newSearch)) =>
  searches
  |. List.keepMap(({store, filter, sort, slices, fields, searches, isNew}) =>
       switch (isNew) {
       | false => None
       | true =>
         switch (fields, cleanSearches(searches)) {
         | ([], []) => None
         | (_, searches) =>
           Some({name: "", store, filter, sort, slices, fields, searches})
         }
       }
     );

let getNewSearches = (searches: list(search), newSearches: list(search)) =>
  switch (
    getSplitSearches([
      newSearches |. List.map(search => (search, true)),
      searches |. List.map(search => (search, false)),
    ])
  ) {
  | [newSearches, ..._] => newSearches |. cleanSearches
  | _ => raise(Not_found)
  };