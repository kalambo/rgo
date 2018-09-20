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
  getValueLayer: string => (option(valueLayer), option(search)),
};

let collect1 = (getter, func, request) => {
  let allRequests = ref(noneToEmpty(request));
  let value =
    func(a => {
      let (value, requests) = getter(a);
      allRequests := Array.concat(allRequests^, requests);
      value;
    });
  (value, allRequests^);
};
let collect2 = (getter, differ, func, request) => {
  let allRequests = ref(noneToEmpty(request));
  let value =
    func(
      a => {
        let (value, requests) = getter(a);
        allRequests := Array.concat(allRequests^, requests);
        value;
      },
      (a, b) => {
        let (value, requests) = differ(a, b);
        allRequests := Array.concat(allRequests^, requests);
        value;
      },
    );
  (value, allRequests^);
};

let rec getValue = ((value, getRecordLayer)) =>
  collect1(
    getRecord,
    getRecord =>
      switch (value, getRecordLayer) {
      | (None, _) => None
      | (Some(Null), _) => Some(RunValue(Null))
      | (Some(Value(value)), None) => Some(RunValue(Value(value)))
      | (Some(Value(String(id))), Some(getRecordLayer)) =>
        getRecord(getRecordLayer(id))
        |. mapSome(record => Some(RunRecord(record)))
      | _ => raise(Not_found)
      },
    None,
  )
and getRecordValue = ((value, request)) =>
  collect1(
    getValue,
    getValue =>
      switch (value) {
      | Some({value: LayerSingle(value), getRecordLayer}) =>
        getValue((Some(value), getRecordLayer))
        |. mapSome(value => Some(RunSingle(value)))
      | Some({value: LayerArray(values), getRecordLayer}) =>
        values
        |. Array.map(value => getValue((value, getRecordLayer)))
        |. (values => Some(RunArray(values)))
      | None => None
      },
    request,
  )
and getRecord = ({fields, getValueLayer}) =>
  collect1(
    getRecordValue,
    getRecordValue =>
      fields
      |. Array.map(field =>
           getRecordValue(getValueLayer(field))
           |. mapSome(value => Some((field, value)))
         )
      |. (values => values |. Array.keepMap(v => v) |. emptyToNone),
    None,
  );

let rec diffValues = ((value1, getRecordLayer1), (value2, getRecordLayer2)) =>
  collect2(
    getValue,
    diffRecords,
    (getValue, diffRecords) =>
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
        getValue((value, getRecordLayer2))
        |. mapSome(value => Some(ChangeValue(value)))
      },
    None,
  )
and diffRecordValues = ((value1, _), (value2, request)) =>
  collect2(
    getValue,
    diffValues,
    (getValue, diffValues) =>
      switch (value1, value2) {
      | (prev, None) => prev |. mapSome(_ => Some(ChangeClear))
      | (
          Some({value: LayerSingle(value1), getRecordLayer: getRecordLayer1}),
          Some({
            value: LayerSingle(value2),
            getRecordLayer: getRecordLayer2,
          }),
        ) =>
        diffValues(
          (Some(value1), getRecordLayer1),
          (Some(value2), getRecordLayer2),
        )
        |. mapSome(change =>
             Some(
               switch (change) {
               | ChangeValue(value) => ChangeSetSingle(value)
               | ChangeRecord(record) => ChangeSingle(record)
               },
             )
           )
      | (_, Some({value: LayerSingle(value), getRecordLayer})) =>
        getValue((Some(value), getRecordLayer))
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
            [|
              ArrayRemove(0, values1 |. Array.length),
              ArrayAdd(0, values2),
            |]
        )
        |. Array.map(change =>
             switch (change) {
             | ArrayAdd(index, values) =>
               values
               |. Array.map(value => getValue((value, getRecordLayer2)))
               |. (values => Some(ArrayAdd(index, values)))
             | ArrayChange(index, value) =>
               diffValues(
                 (value, getRecordLayer1),
                 (value, getRecordLayer2),
               )
               |. mapSome(change => Some(ArrayChange(index, change)))
             | ArrayRemove(index, count) => Some(ArrayRemove(index, count))
             }
           )
        |. Array.keepMap(c => c)
        |. emptyToNone
        |. mapSome(changes => Some(ChangeArray(changes)))

      | (_, Some({value: LayerArray(values), getRecordLayer})) =>
        values
        |. Array.map(value => getValue((value, getRecordLayer)))
        |. (changes => Some(ChangeSetArray(changes)))
      },
    request,
  )
and diffRecords =
    (
      {fields: fields1, getValueLayer: getValueLayer1},
      {fields: fields2, getValueLayer: getValueLayer2},
    ) =>
  collect2(
    getValue,
    diffRecordValues,
    (_, diffRecordValues) =>
      Array.concat(fields1, fields2)
      |. Set.String.fromArray
      |. Set.String.toArray
      |. Array.map(field =>
           diffRecordValues(getValueLayer1(field), getValueLayer2(field))
           |. mapSome(change => Some((field, change)))
         )
      |. Array.keepMap(c => c)
      |. emptyToNone,
    None,
  );

let rec createRecordLayer =
        (
          schema: schema,
          data: dataState,
          parent: option((string, string)),
          fields: array(fieldPath),
          searches: array(search),
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
          | Some(value) => (
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
                          )
                      ),
                    ),
              }),
              None,
            )
          | None => (
              None,
              Some({
                name: "",
                store,
                filter:
                  Filter(
                    [|"id"|],
                    FilterEq,
                    FilterValue(Value(String(id))),
                  ),
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
              }),
            )
          }
        | None => raise(Not_found)
        }
      | (None, Some(({store, fields, searches} as search, idsAndGaps))) => (
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
                         )
                     ),
                   ),
               })
             ),
          switch (idsAndGaps) {
          | Some((_, Some(gaps))) => Some({...search, slices: gaps})
          | Some((_, None)) => None
          | None => Some(search)
          },
        )
      | (None, None)
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
    ) =>
  diffRecords(
    createRecordLayer(schema, data1, None, [||], searches1),
    createRecordLayer(schema, data2, None, [||], searches2),
  );