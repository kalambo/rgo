open Belt;
open Types;
open Utils;

let compareDirectionValues = (value1: directionValue, value2: directionValue) =>
  value1 == value2 ?
    0 :
    (
      switch (value1, value2) {
      | (
          LowValue(Some(Value(value1))) | HighValue(Some(Value(value1))),
          LowValue(Some(Value(value2))) | HighValue(Some(Value(value2))),
        ) =>
        value1 == value2 ? 0 : value1 < value2 ? (-1) : 1
      | (LowValue(None), _)
      | (_, HighValue(None)) => (-1)
      | (_, LowValue(None))
      | (HighValue(None), _) => 1
      | (LowValue(Some(Null)), _)
      | (_, HighValue(Some(Null))) => (-1)
      | (_, LowValue(Some(Null)))
      | (HighValue(Some(Null)), _) => 1
      }
    );

let mergeData = (data1: data, data2: data) =>
  mergeMaps(data1, data2, (records1, records2) =>
    Some(
      mergeMaps(records1, records2, (record1, record2) =>
        Some(mergeMaps(record1, record2, (_, value) => Some(value)))
      ),
    )
  );

let mergeNullData = (data1: data, data2: nullData) =>
  mergeConvertMaps(
    data1,
    data2,
    records2 =>
      records2
      |. Array.keepMap(((id, record)) =>
           record |. mapSome(record => Some((id, record)))
         )
      |. emptyToNone,
    (records1, records2) =>
      Some(
        mergeConvertMaps(
          records1,
          records2,
          record2 => record2,
          (record1, record2) =>
            record2
            |. mapSome(record2 =>
                 Some(
                   mergeMaps(record1, record2, (_, value) => Some(value)),
                 )
               ),
        ),
      ),
  );

let mergeNullNullData = (data1: nullData, data2: nullData) =>
  mergeMaps(data1, data2, (records1, records2) =>
    Some(
      mergeMaps(records1, records2, (record1, record2) =>
        Some(
          switch (record1, record2) {
          | (_, None as record2)
          | (None, Some(_) as record2) => record2
          | (Some(record1), Some(record2)) =>
            Some(mergeMaps(record1, record2, (_, value) => Some(value)))
          },
        )
      ),
    )
  );

let rec getDataValue =
        (schema: schema, data: data, store: string, id: string, field: string)
        : option(recordValue) =>
  switch (get2(schema.formulae, store, field)) {
  | Some({fields, formula}) =>
    switch (
      Array.map(fields, field => getDataValue(schema, data, store, id, field))
    ) {
    | values when values |. Array.some(value => value == None) => None
    | values => values |. Array.keepMap(v => v) |. formula |. Some
    }
  | None => get3(data, store, id, field)
  };

let rec getNestedValue =
        (
          schema: schema,
          data: data,
          store: string,
          value: value,
          field: fieldPath,
        ) =>
  switch (take(field)) {
  | None => value
  | Some((field, path)) =>
    switch (get2(schema.links, store, field)) {
    | Some(nextStore) =>
      switch (value) {
      | Value(String(value)) =>
        getNestedValue(
          schema,
          data,
          nextStore,
          switch (getDataValue(schema, data, store, value, field)) {
          | Some(SingleValue(value)) => value
          | _ => raise(Not_found)
          },
          path,
        )
      | Null => Null
      | _ => raise(Not_found)
      }
    | _ => raise(Not_found)
    }
  };

let rec idInFilter =
        (
          schema: schema,
          data: data,
          store: string,
          id: string,
          filter: filter(value),
        ) =>
  switch (filter) {
  | FilterOr(filters) =>
    filters
    |. Array.some(filter => idInFilter(schema, data, store, id, filter))
  | FilterAnd(filters) =>
    filters
    |. Array.every(filter => idInFilter(schema, data, store, id, filter))
  | FilterIn(field, values) =>
    getNestedValue(schema, data, store, Value(String(id)), field)
    |. (v => values |. Array.some(value => value == v))
  | Filter(field, operation, value) =>
    getNestedValue(schema, data, store, Value(String(id)), field)
    |. (
      v =>
        switch (operation) {
        | FilterNeq => value != v
        | FilterLte => value <= v
        | FilterGte => value >= v
        | FilterEq => value == v
        | FilterLt => value < v
        | FilterGt => value > v
        }
    )
  };

let compareIds =
    (
      schema: schema,
      data: data,
      store: string,
      sort: sort,
      id1: string,
      id2: string,
    ) =>
  sort
  |. Array.reduce(0, (res, (Asc(field) | Desc(field)) as sort) =>
       res != 0 ?
         res :
         (
           switch (
             getNestedValue(schema, data, store, Value(String(id1)), field),
             getNestedValue(schema, data, store, Value(String(id2)), field),
           ) {
           | (value1, value2) when value1 == value2 => 0
           | (Value(value1), Value(value2)) =>
             (
               switch (sort) {
               | Asc(_) => 1
               | Desc(_) => (-1)
               }
             )
             * (value1 < value2 ? (-1) : 1)
           | (Null, _) => 1
           | (_, Null) => (-1)
           }
         )
     );

let getSortedIds =
    (
      schema: schema,
      data: data,
      store: string,
      filter: filter(value),
      sort: sort,
    ) =>
  (
    switch (data |. get(store)) {
    | Some(ids) => ids |. Array.map(((key, _)) => key)
    | None => [||]
    }
  )
  |. Array.keep(id => idInFilter(schema, data, store, id, filter))
  |. List.fromArray
  |. List.sort(compareIds(schema, data, store, sort))
  |. List.toArray;

type changeType =
  | ChangeAdd
  | ChangeRemove;

let getDataChanges =
    (
      schema: schema,
      data: data,
      newData: nullData,
      store: string,
      filter: filter(value),
      sort: sort,
    ) => {
  let ids = getSortedIds(schema, data, store, filter, sort);
  let combined = mergeNullData(data, newData);
  let (changes, combinedIds) =
    (
      switch (newData |. get(store)) {
      | Some(records) => records |. Array.map(((key, _)) => key)
      | None => [||]
      }
    )
    |. Array.reduce(
         ([||], ids),
         ((changes, ids), id) => {
           let (items, ids) =
             switch (ids |. indexOf(id)) {
             | Some(index) =>
               let newIds = splice(ids, index, 1, [||]);
               (Array.concat(changes, [|(index, ChangeAdd)|]), newIds);
             | None => (changes, ids)
             };
           if (must(get2(newData, store, id)) != None
               && idInFilter(schema, combined, store, id, filter)) {
             let index =
               locationOf(
                 ids,
                 id,
                 compareIds(schema, combined, store, sort),
               );
             let newIds = splice(ids, index, 0, [|id|]);
             (Array.concat(changes, [|(index, ChangeRemove)|]), newIds);
           } else {
             (items, ids);
           };
         },
       );
  (changes, (ids, combinedIds));
};

let applyDataChanges =
    (
      changes: array((int, changeType)),
      items: array('a),
      map: ('a, int, int) => 'a,
      reverse: bool,
    ) =>
  (reverse ? Array.reverse(changes) : changes)
  |. Array.reduce(items, (items, (index, changeType)) =>
       switch (changeType) {
       | ChangeAdd =>
         items |. Array.map(item => map(item, index, reverse ? (-1) : 1))
       | ChangeRemove =>
         items |. Array.map(item => map(item, index, reverse ? 1 : (-1)))
       }
     );

let updateRanges = (schema: schema, data: dataState, newData: nullData) =>
  merge(data.ranges, newData, (store, ranges, _) =>
    switch (ranges) {
    | None => None
    | Some(ranges) =>
      Some(
        ranges
        |. Array.map(range =>
             switch (range) {
             | FullRange(_) => range
             | PartialRange(filter, sort, ranges) =>
               PartialRange(
                 filter,
                 sort,
                 applyDataChanges(
                   fst(
                     getDataChanges(
                       schema,
                       data.server,
                       newData,
                       store,
                       filter,
                       sort,
                     ),
                   ),
                   ranges,
                   ((rangeStart, rangeLength), index, change) => (
                     switch (rangeStart) {
                     | RangeIndex(rangeStart, id) when index < rangeStart =>
                       RangeIndex(rangeStart + change, id)
                     | rangeStart => rangeStart
                     },
                     switch (rangeLength) {
                     | Some(rangeLength) when index < rangeLength =>
                       (
                         switch (rangeStart) {
                         | RangeFirst => true
                         | RangeIndex(rangeStart, _) => rangeStart <= index
                         }
                       ) ?
                         Some(rangeLength + change) : Some(rangeLength)
                     | rangeLength => rangeLength
                     },
                   ),
                   false,
                 ),
               )
             }
           ),
      )
    }
  );