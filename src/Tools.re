open Belt;
open Types;

let mapGet2 = (map, key1, key2) =>
  switch (Map.String.get(map, key1)) {
  | Some(value) => Map.String.get(value, key2)
  | None => None
  };

let mapGet3 = (map, key1, key2, key3) =>
  switch (mapGet2(map, key1, key2)) {
  | Some(value) => Map.String.get(value, key3)
  | None => None
  };

let rec getRecordValues =
        (
          schema: schema,
          data: data,
          store: string,
          id: string,
          path: list(string),
        ) =>
  switch (path) {
  | [] => []
  | [field] =>
    switch (mapGet3(data, store, id, field)) {
    | Some(Single(Some(value))) => [value]
    | Some(List(values)) => values
    | _ => []
    }
  | [field, ...path] =>
    switch (mapGet2(schema, store, field), mapGet3(data, store, id, field)) {
    | (Some(store), Some(LinkSingle(Some(id)))) =>
      getRecordValues(schema, data, store, id, path)
    | (Some(store), Some(LinkList(ids))) =>
      ids
      |. List.map(id => getRecordValues(schema, data, store, id, path))
      |. List.flatten
    | _ => []
    }
  };

let recordInFilterBox =
    (
      schema: schema,
      data: data,
      store: string,
      id: string,
      filterBox: filterBox,
    ) =>
  filterBox
  |. Map.every((field, (lower, upper)) =>
       getRecordValues(schema, data, store, id, field)
       |. List.some(v =>
            (
              switch (lower) {
              | Some(lower) => lower < v
              | _ => true
              }
            )
            && (
              switch (upper) {
              | Some(upper) => v < upper
              | _ => true
              }
            )
          )
     );

let rec compareRecords =
        (
          schema: schema,
          data: data,
          store: string,
          sort: sort,
          id1: string,
          id2: string,
        ) =>
  switch (sort) {
  | [] => 0
  | [(field, dir), ...sort] =>
    switch (
      switch (
        getRecordValues(schema, data, store, id1, field),
        getRecordValues(schema, data, store, id2, field),
      ) {
      | ([], []) => 0
      | ([], _) => 1
      | (_, []) => (-1)
      | (v1, v2) =>
        switch (dir) {
        | Asc => compare(v1, v2)
        | Desc => compare(v2, v1)
        }
      }
    ) {
    | 0 => compareRecords(schema, data, store, sort, id1, id2)
    | x => x
    }
  };
/*
 let sortRecords =
     (
       schema: schema,
       data: data,
       store: string,
       ids: list(string),
       sort: sort,
     ) =>
   List.sort(ids, compareRecords(schema, data, store, sort)); */