open Belt;
open Types;
open Utils;
open Data;
open Ids;

type layerValue =
  | LayerSingle(value)
  | LayerArray(array(option(value)));
type valueLayer = {
  store: string,
  value: layerValue,
  getRecordLayer: option(string => recordLayer),
}
and recordLayer = {
  fields: array(string),
  getValueLayer: string => option(valueLayer),
};

let rec getValue = (value, getRecordLayer) =>
  switch (value, getRecordLayer) {
  | (None, _) => None
  | (Some(Null), _) => Some(RunValue(Null))
  | (Some(Value(value)), None) => Some(RunValue(Value(value)))
  | (Some(Value(String(id))), Some(getRecordLayer)) =>
    getRecord(getRecordLayer(id))
    |. mapSome(record => Some(RunRecord(record)))
  | _ => raise(Not_found)
  }
and getRecordValue = value =>
  switch (value) {
  | None => None
  | Some({value: LayerSingle(value), getRecordLayer}) =>
    getValue(Some(value), getRecordLayer)
    |. mapSome(value => Some(RunSingle(value)))
  | Some({value: LayerArray(values), getRecordLayer}) =>
    values
    |. Array.map(value => getValue(value, getRecordLayer))
    |. (values => Some(RunArray(values)))
  }
and getRecord = ({fields, getValueLayer}) =>
  fields
  |. Array.map(field =>
       getRecordValue(getValueLayer(field))
       |. mapSome(value => Some((field, value)))
     )
  |. (values => values |. Array.keepMap(v => v) |. emptyToNone);

let rec diffValues = (value1, value2, getRecordLayer1, getRecordLayer2) =>
  switch (value1, getRecordLayer1, value2, getRecordLayer2) {
  | (
      Some(Value(String(id1))),
      Some(getRecordLayer1),
      Some(Value(String(id2))),
      Some(getRecordLayer2),
    ) =>
    diffRecords(getRecordLayer1(id1), getRecordLayer2(id2))
    |. mapSome(changes => Some(ChangeRecord(changes)))
  | (_, _, value, getRecordLayer2) =>
    getValue(value, getRecordLayer2)
    |. mapSome(value => Some(ChangeValue(value)))
  }
and diffRecordValues = (value1, value2) =>
  switch (value1, value2) {
  | (prev, None) => prev |. mapSome(_ => Some(ChangeClear))
  | (
      Some({value: LayerSingle(value1), getRecordLayer: getRecordLayer1}),
      Some({value: LayerSingle(value2), getRecordLayer: getRecordLayer2}),
    ) =>
    diffValues(Some(value1), Some(value2), getRecordLayer1, getRecordLayer2)
    |. mapSome(change =>
         Some(
           switch (change) {
           | ChangeValue(value) => ChangeSetSingle(value)
           | ChangeRecord(record) => ChangeSingle(record)
           },
         )
       )
  | (_, Some({value: LayerSingle(value), getRecordLayer})) =>
    getValue(Some(value), getRecordLayer)
    |. mapSome(change => Some(ChangeSetSingle(change)))
  | (
      Some({
        store: store1,
        value: LayerArray(values1),
        getRecordLayer: getRecordLayer1,
      }),
      Some({
        store: store2,
        value: LayerArray(values2),
        getRecordLayer: getRecordLayer2,
      }),
    ) =>
    (
      store1 == store2 ?
        diff(values1, values2) :
        [|ArrayRemove(0, values1 |. Array.length), ArrayAdd(0, values2)|]
    )
    |. Array.map(change =>
         switch (change) {
         | ArrayAdd(index, values) =>
           values
           |. Array.map(value => getValue(value, getRecordLayer2))
           |. (values => Some(ArrayAdd(index, values)))
         | ArrayChange(index, value) =>
           diffValues(value, value, getRecordLayer1, getRecordLayer2)
           |. mapSome(change => Some(ArrayChange(index, change)))
         | ArrayRemove(index, count) => Some(ArrayRemove(index, count))
         }
       )
    |. Array.keepMap(c => c)
    |. emptyToNone
    |. mapSome(changes => Some(ChangeArray(changes)))

  | (_, Some({value: LayerArray(values), getRecordLayer})) =>
    values
    |. Array.map(value => getValue(value, getRecordLayer))
    |. (changes => Some(ChangeSetArray(changes)))
  }
and diffRecords =
    (
      {fields: fields1, getValueLayer: getValueLayer1},
      {fields: fields2, getValueLayer: getValueLayer2},
    ) =>
  Array.concat(fields1, fields2)
  |. Set.String.fromArray
  |. Set.String.toArray
  |. Array.map(field =>
       diffRecordValues(getValueLayer1(field), getValueLayer2(field))
       |. mapSome(change => Some((field, change)))
     )
  |. Array.keepMap(c => c)
  |. emptyToNone;

let rec createRecordLayer =
        (
          schema: schema,
          data: dataState,
          parent: option((string, string)),
          fields: array(fieldPath),
          searches: array(search),
          addRequest: search => unit,
        ) => {
  let groupedFields =
    groupBy(fields, (_, fieldPath) =>
      switch (take(fieldPath)) {
      | None => raise(Not_found)
      | Some((field, path)) => (field, path)
      }
    );
  let fields =
    Array.concat(
      groupedFields |. Array.map(((f, _)) => f),
      searches |. Array.map(search => search.name),
    )
    |. Set.String.fromArray
    |. Set.String.toArray;
  {
    fields,
    getValueLayer: field =>
      switch (
        groupedFields |. get(field),
        searches
        |. find(search => search.name == field)
        |. mapSome(search =>
             Some((search, getSearchIds(schema, data, search, parent)))
           ),
      ) {
      | (Some(fields), None) =>
        switch (parent) {
        | Some((store, id)) =>
          switch (
            getDataValue(
              schema,
              mergeNullData(data.server, data.client),
              store,
              id,
              field,
            )
          ) {
          | Some(value) =>
            Some({
              store,
              value:
                switch (value) {
                | SingleValue(value) => LayerSingle(value)
                | ArrayValue(values) =>
                  LayerArray(values |. Array.map(value => Some(value)))
                },
              getRecordLayer:
                fields == [|[||]|] ?
                  None :
                  Some(
                    (
                      id =>
                        createRecordLayer(
                          schema,
                          data,
                          Some((
                            must(get2(schema.links, store, field)),
                            id,
                          )),
                          fields,
                          [||],
                          addRequest,
                        )
                    ),
                  ),
            })
          | None =>
            addRequest({
              name: "",
              store,
              filter: [|
                [|
                  (
                    [|"id"|],
                    FilterPoint({
                      value: Some(Value(String(id))),
                      fields: [||],
                    }),
                  ),
                |],
              |],
              sort: [|Asc([|"id"|])|],
              slices: [|(0, None)|],
              fields:
                switch (fields, get2(schema.formulae, store, field)) {
                | ([||], None) => [|[|field|]|]
                | ([||], Some({fields})) =>
                  fields |. Array.map(field => [|field|])
                | (paths, None) =>
                  paths |. Array.map(path => Array.concat([|field|], path))
                | (_, Some(_)) => raise(Not_found)
                },
              searches: [||],
            });
            None;
          }
        | None => raise(Not_found)
        }
      | (None, Some(({store, fields, searches} as search, idsAndGaps))) =>
        switch (idsAndGaps) {
        | Some((_, Some(gaps))) => addRequest({...search, slices: gaps})
        | Some((_, None)) => ()
        | None => addRequest(search)
        };
        idsAndGaps
        |. mapSome(((ids, _)) =>
             Some({
               store,
               value:
                 ids
                 |. Array.map(id =>
                      id |. mapSome(id => Some(Value(String(id))))
                    )
                 |. LayerArray,
               getRecordLayer:
                 Some(
                   (
                     id =>
                       createRecordLayer(
                         schema,
                         data,
                         Some((store, id)),
                         fields,
                         searches,
                         addRequest,
                       )
                   ),
                 ),
             })
           );
      | (None, None) => None
      | (Some(_), Some(_)) => raise(Not_found)
      },
  };
};

let run =
    (
      schema: schema,
      data1: dataState,
      data2: dataState,
      searches1: array(search),
      searches2: array(search),
    ) => {
  let requests = ref([||]);
  let addRequest = request =>
    requests := Array.concat([|request|], requests^);
  let changes =
    diffRecords(
      createRecordLayer(schema, data1, None, [||], searches1, _ => ()),
      createRecordLayer(schema, data2, None, [||], searches2, addRequest),
    );
  (changes, requests^);
};