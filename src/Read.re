open Belt;
open Types;
open Tools;

/*
 type indexTree =
   | Leaf
   | Node(Map.Int.t(indexTree)); */

let pairsToMap = l =>
  switch (
    l
    |. List.keepMap(((i, v)) =>
         switch (v) {
         | Some(v) => Some((i, v))
         | None => None
         }
       )
  ) {
  | x when List.length(x) == 0 => None
  | x => Some(x |. List.toArray |. Map.Int.fromArray)
  };
/*
 let rec readFields =
         (
           schema: schema,
           data: data,
           store: string,
           ids: list(string),
           fields: list((string, selectionField)),
           changes: data,
         ) =>
   fields
   |. List.mapWithIndex((i, (field, fieldType)) =>
        (
          i,
          switch (fieldType) {
          | Leaf =>
            keyStore == store
            && List.some(ids, id => id == keyId)
            && keyField == field ?
              Some(Leaf) : None
          | Node(subFields) =>
            readFields(
              schema,
              data,
              switch (Map.String.get(schema, store)) {
              | Some(storeSchema) =>
                switch (Map.String.get(storeSchema, field)) {
                | Some(scalar) =>
                  switch (scalar) {
                  | Link_(link)
                  | LinkList_(link) => link
                  | _ => raise(Not_found)
                  }
                | None => raise(Not_found)
                }
              | None => raise(Not_found)
              },
              [],
              subFields,
              (keyStore, keyId, keyField),
            )
          },
        )
      )
   |. pairsToMap; */

let ledgerIdChanges = (schema: schema, data: data, {store, all}) => {
  let allIds =
    switch (Map.String.get(data, store)) {
    | Some(records) => records |. Map.String.keysToArray |. List.fromArray
    | None => []
    };
  let x =
    allIds
    |. List.keep(id =>
         Set.some(all, filterBox =>
           recordInFilterBox(schema, data, store, id, filterBox)
         )
       );
  ();
};

let rec read =
        (schema: schema, data: data, ledgers: list(ledger), changes: data)
        : Map.Int.t(changes) =>
  List.mapWithIndex(ledgers, (i, {store, all, pages, fields, searches}) =>
    (
      i,
      {
        ids: {
          added: [],
          removed: [],
        },
        searches: read(schema, data, searches, changes),
      },
    )
  )
  |. List.toArray
  |. Map.Int.fromArray;

/* [
     (
       0,
       switch (fields) {
       | Node(fields) =>
         readFields(schema, data, store, selection.ids, fields, changes)
       | Leaf => None
       },
     ),
     (1, read(schema, data, searches, changes)),
   ]
   |. pairsToMap, */