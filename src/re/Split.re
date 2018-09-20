open Belt;
open Types;
open Utils;
open Filters;

type newSearch = {
  store: string,
  filter: array(filterMap),
  sort,
  slices: array(slice),
  fields: array(fieldPath),
  searches: array(newSearch),
  isNew: bool,
};

let getFilterSearches = (searches: array(newSearch)) => {
  let splitSearches =
    Array.zip(
      searches,
      searches |. Array.map(search => search.filter) |. getSplitFilters,
    )
    |. Array.map(((search, filter)) => {...search, filter});
  splitSearches
  |. Array.map(search =>
       search.slices == [|(0, None)|] ?
         [|search|] :
         {
           let coveredFilters =
             splitSearches
             |. Array.keepMap(({filter, slices}) =>
                  slices != [|(0, None)|]
                  && containsAll(search.filter, filter) ?
                    Some(filter) : None
                );
           Array.concat(
             coveredFilters |. Array.map(filter => {...search, filter}),
             search.filter
             |. Array.keepMap(filterMap =>
                  coveredFilters
                  |. Array.concatMany
                  |. Array.every(f => f != filterMap) ?
                    Some({...search, filter: [|filterMap|]}) : None
                ),
           );
         }
     );
};

let getSplitSlices = (slicesArray: array(array(slice))) => {
  let values =
    Array.concat(
      unique(
        slicesArray
        |. Array.map(slices =>
             slices
             |. Array.map(slice =>
                  switch (slice) {
                  | (startValue, Some(endValue)) => [|
                      Some(startValue),
                      Some(endValue),
                    |]
                  | (startValue, None) => [|Some(startValue)|]
                  }
                )
           )
        |. Array.concatMany
        |. Array.concatMany,
      )
      |. List.fromArray
      |. List.sort(compare)
      |. List.toArray,
      [|None|],
    );
  slicesArray
  |. Array.map(slices =>
       slices
       |. Array.map(((sliceStart, sliceEnd)) =>
            values
            |. Array.mapWithIndex((index, value1) =>
                 switch (sliceEnd, value1, values[index + 1]) {
                 | (_, None, _)
                 | (_, _, None) => None
                 | (Some(sliceEnd), Some(value1), Some(value2)) =>
                   value1 >= sliceStart && value1 < sliceEnd ?
                     Some((value1, value2)) : None
                 | (None, Some(value1), Some(value2)) =>
                   value1 >= sliceStart ? Some((value1, value2)) : None
                 }
               )
            |. Array.keepMap(v => v)
          )
     )
  |. Array.concatMany;
};

type splitField =
  | SplitField(fieldPath)
  | SplitSearch(newSearch);

let rec getSplitSearches =
        (searchesArray: array(array((search, bool))))
        : array(array(newSearch)) =>
  searchesArray
  |. mapFlattened(allSearches =>
       allSearches
       |. mapGroups(
            ((search, _)) => search.store,
            (storeSearches, store) =>
              Array.zip(
                storeSearches,
                storeSearches
                |. Array.map(((search, isNew)) =>
                     search.searches |. Array.map(s => (s, isNew))
                   )
                |. getSplitSearches,
              )
              |. Array.map(
                   (
                     (
                       ({store, filter, sort, slices, fields}, isNew),
                       searches,
                     ),
                   ) =>
                   {
                     store,
                     filter:
                       filterToMap(filter, value =>
                         switch (value) {
                         | FilterValue(value) => {
                             value: Some(value),
                             fields: [||],
                           }
                         | FilterVariable(field) => {
                             value: None,
                             fields: [|field|],
                           }
                         }
                       ),
                     sort,
                     slices,
                     fields,
                     searches,
                     isNew,
                   }
                 )
              |. mapArrayGroups(
                   ({fields, searches}) =>
                     Array.concat(
                       fields |. Array.map(field => SplitField(field)),
                       searches |. Array.map(search => SplitSearch(search)),
                     ),
                   (fieldSearches, allFields) => {
                     let fields =
                       allFields
                       |. Array.keepMap(field =>
                            switch (field) {
                            | SplitField(field) => Some(field)
                            | SplitSearch(_) => None
                            }
                          );
                     let searches =
                       allFields
                       |. Array.keepMap(field =>
                            switch (field) {
                            | SplitSearch(search) => Some(search)
                            | SplitField(_) => None
                            }
                          );
                     fieldSearches
                     |. getFilterSearches
                     |. mapFlattened(allFilterSearches =>
                          allFilterSearches
                          |. mapArrayGroups(
                               search => search.filter,
                               (filterSearches, filter) =>
                                 filterSearches
                                 |. mapGroups(
                                      search => search.sort,
                                      (sortSearches, sort) =>
                                        Array.zip(
                                          sortSearches,
                                          sortSearches
                                          |. Array.map(search =>
                                               search.slices
                                             )
                                          |. getSplitSlices,
                                        )
                                        |. Array.map(((search, slices)) =>
                                             {...search, slices}
                                           )
                                        |. mapArrayGroups(
                                             search => search.slices,
                                             (sliceSearches, slices) => [|
                                               {
                                                 store,
                                                 filter,
                                                 sort,
                                                 slices,
                                                 fields,
                                                 searches,
                                                 isNew:
                                                   sliceSearches
                                                   |. Array.every(s => s.isNew),
                                               },
                                             |],
                                           ),
                                    ),
                             )
                        );
                   },
                 ),
          )
     )
  |. Array.map(v =>
       v
       |. Array.concatMany
       |. Array.concatMany
       |. Array.concatMany
       |. Array.concatMany
     );

let rec cleanSearches = (searches: array(newSearch)) =>
  searches
  |. Array.keepMap(({store, filter, sort, slices, fields, searches, isNew}) =>
       switch (isNew) {
       | false => None
       | true =>
         switch (fields, cleanSearches(searches)) {
         | ([||], [||]) => None
         | (_, searches) =>
           Some({
             name: "",
             store,
             filter: filterFromMap(filter),
             sort,
             slices,
             fields,
             searches,
           })
         }
       }
     );

let getNewSearches = (searches: array(search), newSearches: array(search)) =>
  switch (
    getSplitSearches([|
      newSearches |. Array.map(search => (search, true)),
      searches |. Array.map(search => (search, false)),
    |])
    |. Array.get(0)
  ) {
  | Some(newSearches) => newSearches |. cleanSearches
  | None => raise(Not_found)
  };