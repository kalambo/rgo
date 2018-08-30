open Belt;
open Types;
open Utils;
open Data;
open Ids;

type runValue =
  | RunValue(value)
  | RunRecord(list((string, runRecordValue)))
and runRecordValue =
  | RunSingle(runValue)
  | RunList(list(option(runValue)));

let createFilter = (store, id, field, paths) => {
  name: "",
  store,
  filter: [
    [
      (["id"], FilterPoint({value: Some(Value(String(id))), fields: []})),
    ]
    |. List.toArray
    |. Map.fromArray(~id=(module FieldCmp)),
  ],
  sort: [Asc(["id"])],
  slices: [(0, None)],
  fields:
    switch (paths) {
    | [] => [[field]]
    | paths => paths |. List.map(path => [field, ...path])
    },
  searches: [],
};

let rec runValue =
        (schema, data, store, value, fields)
        : (option(runValue), list(search)) =>
  switch (value, fields) {
  | (Null, _) => (Some(RunValue(Null)), [])
  | (Value(value), []) => (Some(RunValue(Value(value))), [])
  | (Value(String(id)), fields) =>
    runRecord(schema, data, store, id, fields)
    |. mapPair(r => r |. mapSome(r => RunRecord(r)), requests => requests)
  | _ => raise(Not_found)
  }
and runRecordValue =
    (schema, data, store, id, field, paths)
    : (option(runRecordValue), list(search)) =>
  switch (getDataValue(schema, data, store, id, field)) {
  | None => (None, [createFilter(store, id, field, paths)])
  | Some(Single(value)) =>
    runValue(schema, data, store, value, paths)
    |. mapPair(
         result => result |. mapSome(result => RunSingle(result)),
         requests => requests,
       )
  | Some(List(values)) =>
    values
    |. List.map(value => runValue(schema, data, store, value, paths))
    |. List.unzip
    |. mapPair(
         results => Some(RunList(results)),
         requestsList => requestsList |. List.flatten,
       )
  }
and runRecord =
    (schema, data, store, id, fields)
    : (option(list((string, runRecordValue))), list(search)) =>
  groupBy(fields, (_, fieldPath) =>
    switch (fieldPath) {
    | [] => raise(Not_found)
    | [field, ...path] => (field, path)
    }
  )
  |. List.map(((field, paths)) =>
       runRecordValue(
         schema,
         data,
         must(get2(schema.links, store, field)),
         id,
         field,
         paths,
       )
       |. mapPair(r => r |. mapSome(r => (field, r)), requests => requests)
     )
  |. List.unzip
  |. mapPair(
       results => results |. List.keepMap(v => v) |. emptyToNone,
       requestsList => requestsList |. List.flatten,
     );

let rec runSearch =
        (
          schema: schema,
          data: dataState,
          {name, store, fields, searches} as search: search,
          parent: option((string, string)),
        )
        : (option((string, runRecordValue)), list(search)) => {
  let combined = mergeNullData(data.server, data.client);
  switch (getSearchIds(schema, data, search, parent)) {
  | None => (None, [search])
  | Some((ids, gaps)) =>
    ids
    |. List.map(id =>
         switch (id) {
         | Some(id) =>
           let (recordResult, recordRequests) =
             runRecord(schema, combined, store, id, fields);
           let (searchResult, searchRequestsList) =
             searches
             |. List.map(search =>
                  runSearch(schema, data, search, Some((store, id)))
                )
             |. List.unzip;
           (
             List.concat(
               switch (recordResult) {
               | Some(recordResult) => recordResult
               | None => []
               },
               searchResult |. List.keepMap(v => v),
             )
             |. emptyToNone
             |. mapSome(result => RunRecord(result)),
             List.flatten([recordRequests, ...searchRequestsList]),
           );
         | None => (None, [])
         }
       )
    |. List.unzip
    |. mapPair(
         result => Some((name, RunList(result))),
         requestsList =>
           List.concat(
             [{...search, slices: gaps}],
             requestsList |. List.flatten,
           ),
       )
  };
};

let rec getValueChange = (value1, value2) =>
  switch (value1, value2) {
  | (value1, value2) when value1 == value2 => None
  | (_, None) => Some(ChangeClear)
  | (_, Some(RunValue(value))) => Some(ChangeValue(value))
  | (None, Some(RunRecord(record))) =>
    getRecordChange([], record) |. mapSome(change => ChangeRecord(change))
  | (Some(RunRecord(record1)), Some(RunRecord(record2))) =>
    getRecordChange(record1, record2)
    |. mapSome(change => ChangeRecord(change))
  | (Some(RunValue(_)), Some(RunRecord(_))) => raise(Not_found)
  }
and getRecordChange =
    (
      record1: list((string, runRecordValue)),
      record2: list((string, runRecordValue)),
    )
    : option(list((string, change))) =>
  unique(
    List.concat(
      record1 |. List.map(v => fst(v)),
      record2 |. List.map(v => fst(v)),
    ),
  )
  |. List.keepMap(field =>
       switch (
         record1 |. List.getAssoc(field, eq),
         record2 |. List.getAssoc(field, eq),
       ) {
       | (value1, value2) when value1 == value2 => None
       | (_, None) => Some((field, ChangeSingle(ChangeClear)))
       | (None, Some(RunSingle(value))) =>
         getValueChange(None, Some(value))
         |. mapSome(change => (field, ChangeSingle(change)))
       | (Some(RunSingle(value1)), Some(RunSingle(value2))) =>
         getValueChange(Some(value1), Some(value2))
         |. mapSome(change => (field, ChangeSingle(change)))
       | (None, Some(RunList(values))) =>
         Some((
           field,
           ChangeList(
             values |. List.map(value => getValueChange(None, value)),
           ),
         ))
       | (Some(RunList(values1)), Some(RunList(values2))) =>
         Some((
           field,
           ChangeList(
             values2
             |. List.mapWithIndex((index, value2) =>
                  getValueChange(
                    switch (List.get(values1, index)) {
                    | Some(Some(value1)) => Some(value1)
                    | _ => None
                    },
                    value2,
                  )
                ),
           ),
         ))
       | (Some(RunSingle(_)), Some(RunList(_))) => raise(Not_found)
       | (Some(RunList(_)), Some(RunSingle(_))) => raise(Not_found)
       }
     )
  |. emptyToNone;

let run =
    (
      schema: schema,
      data1: dataState,
      data2: dataState,
      searches1: list(search),
      searches2: list(search),
    ) => {
  let (result1, _) =
    searches1
    |. List.map(search1 => runSearch(schema, data1, search1, None))
    |. List.unzip
    |. mapPair(result => result |. List.keepMap(v => v), requests => requests);
  let (result2, requests) =
    searches2
    |. List.map(search2 => runSearch(schema, data2, search2, None))
    |. List.unzip
    |. mapPair(
         result => result |. List.keepMap(v => v),
         requestsList => requestsList |. List.flatten,
       );
  (getRecordChange(result1, result2), requests);
};