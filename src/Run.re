open Belt;
open Types;
open Utils;
open Data;
open Ids;

type layerValue =
  | LayerSingle(value)
  | LayerList(list(option(value)));
type valueLayer = {
  store: string,
  value: layerValue,
  getRecordLayer: option(string => recordLayer),
}
and recordLayer = {
  fields: list(string),
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
  | Some({value: LayerList(values), getRecordLayer}) =>
    values
    |. List.map(value => getValue(value, getRecordLayer))
    |. (values => Some(RunList(values)))
  }
and getRecord = ({fields, getValueLayer}) =>
  fields
  |. List.map(field =>
       getRecordValue(getValueLayer(field))
       |. mapSome(value => Some((field, value)))
     )
  |. (values => values |. List.keepMap(v => v) |. emptyToNone);

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
        value: LayerList(values1),
        getRecordLayer: getRecordLayer1,
      }),
      Some({
        store: store2,
        value: LayerList(values2),
        getRecordLayer: getRecordLayer2,
      }),
    ) =>
    (
      store1 == store2 ?
        diff(values1, values2) :
        [ListRemove(0, values1 |. List.length), ListAdd(0, values2)]
    )
    |. List.map(change =>
         switch (change) {
         | ListAdd(index, values) =>
           values
           |. List.map(value => getValue(value, getRecordLayer2))
           |. (values => Some(ListAdd(index, values)))
         | ListChange(index, value) =>
           diffValues(value, value, getRecordLayer1, getRecordLayer2)
           |. mapSome(change => Some(ListChange(index, change)))
         | ListRemove(index, count) => Some(ListRemove(index, count))
         }
       )
    |. List.keepMap(c => c)
    |. emptyToNone
    |. mapSome(changes => Some(ChangeList(changes)))

  | (_, Some({value: LayerList(values), getRecordLayer})) =>
    values
    |. List.map(value => getValue(value, getRecordLayer))
    |. (changes => Some(ChangeSetList(changes)))
  }
and diffRecords =
    (
      {fields: fields1, getValueLayer: getValueLayer1},
      {fields: fields2, getValueLayer: getValueLayer2},
    ) =>
  unique(List.concat(fields1, fields2))
  |. List.map(field =>
       diffRecordValues(getValueLayer1(field), getValueLayer2(field))
       |. mapSome(change => Some((field, change)))
     )
  |. List.keepMap(c => c)
  |. emptyToNone;

let rec createRecordLayer =
        (
          schema: schema,
          data: dataState,
          parent: option((string, string)),
          fields: list(fieldPath),
          searches: list(search),
          addRequest: search => unit,
        ) => {
  let groupedFields =
    groupBy(fields, (_, fieldPath) =>
      switch (fieldPath) {
      | [] => raise(Not_found)
      | [field, ...path] => (field, path)
      }
    );
  let fields =
    unique(
      List.concat(
        groupedFields |. List.map(((f, _)) => f),
        searches |. List.map(search => search.name),
      ),
    );
  {
    fields,
    getValueLayer: field =>
      switch (
        groupedFields |. List.getAssoc(field, eq),
        searches
        |. List.getBy(search => search.name == field)
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
                | ListValue(values) =>
                  LayerList(values |. List.map(value => Some(value)))
                },
              getRecordLayer:
                fields == [[]] ?
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
                          [],
                          addRequest,
                        )
                    ),
                  ),
            })
          | None =>
            addRequest({
              name: "",
              store,
              filter: [
                [
                  (
                    ["id"],
                    FilterPoint({
                      value: Some(Value(String(id))),
                      fields: [],
                    }),
                  ),
                ]
                |. List.toArray
                |. Map.fromArray(~id=(module FieldCmp)),
              ],
              sort: [Asc(["id"])],
              slices: [(0, None)],
              fields:
                switch (fields) {
                | [] => [[field]]
                | paths => paths |. List.map(path => [field, ...path])
                },
              searches: [],
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
                 |. List.map(id =>
                      id |. mapSome(id => Some(Value(String(id))))
                    )
                 |. LayerList,
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
      searches1: list(search),
      searches2: list(search),
    ) => {
  let requests = ref([]);
  let addRequest = request => requests := [request, ...requests^];
  let changes =
    diffRecords(
      createRecordLayer(schema, data1, None, [], searches1, _ => ()),
      createRecordLayer(schema, data2, None, [], searches2, addRequest),
    );
  (changes, requests^);
};