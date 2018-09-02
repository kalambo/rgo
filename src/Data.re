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
  Map.String.merge(data1, data2, (_, records1, records2) =>
    switch (records1, records2) {
    | (Some(records1), Some(records2)) =>
      Some(
        Map.String.merge(records1, records2, (_, record1, record2) =>
          switch (record1, record2) {
          | (Some(record1), Some(record2)) =>
            Some(
              Map.String.merge(record1, record2, (_, value1, value2) =>
                switch (value1, value2) {
                | (Some(_), Some(value))
                | (Some(value), None)
                | (None, Some(value)) => Some(value)
                | (None, None) => raise(Not_found)
                }
              ),
            )
          | (Some(record), None)
          | (None, Some(record)) => Some(record)
          | (None, None) => raise(Not_found)
          }
        ),
      )
    | (Some(records), None)
    | (None, Some(records)) => Some(records)
    | (None, None) => raise(Not_found)
    }
  );

let mergeNullData = (data1: data, data2: nullData) =>
  Map.String.merge(data1, data2, (_, records1, records2) =>
    switch (records1, records2) {
    | (Some(records1), Some(records2)) =>
      Some(
        Map.String.merge(records1, records2, (_, record1, record2) =>
          switch (record1, record2) {
          | (_, Some(None)) => None
          | (Some(record1), Some(Some(record2))) =>
            Some(
              Map.String.merge(record1, record2, (_, value1, value2) =>
                switch (value1, value2) {
                | (Some(_), Some(value))
                | (Some(value), None)
                | (None, Some(value)) => Some(value)
                | (None, None) => raise(Not_found)
                }
              ),
            )
          | (record, None)
          | (None, Some(record)) => record
          }
        ),
      )
    | (Some(records), None) => Some(records)
    | (None, Some(records)) =>
      Some(
        records
        |. Map.String.toArray
        |. Array.keepMap(((id, record)) =>
             record |. mapSome(record => Some((id, record)))
           )
        |. Map.String.fromArray,
      )
    | (None, None) => raise(Not_found)
    }
  );

let mergeNullNullData = (data1: nullData, data2: nullData) =>
  Map.String.merge(data1, data2, (_, records1, records2) =>
    switch (records1, records2) {
    | (Some(records1), Some(records2)) =>
      Some(
        Map.String.merge(records1, records2, (_, record1, record2) =>
          switch (record1, record2) {
          | (_, Some(None)) => Some(None)
          | (Some(Some(record1)), Some(Some(record2))) =>
            Some(
              Some(
                Map.String.merge(record1, record2, (_, value1, value2) =>
                  switch (value1, value2) {
                  | (Some(_), Some(value))
                  | (Some(value), None)
                  | (None, Some(value)) => Some(value)
                  | (None, None) => raise(Not_found)
                  }
                ),
              ),
            )
          | (Some(record), None)
          | (None | Some(None), Some(record)) => Some(record)
          | (None, None) => raise(Not_found)
          }
        ),
      )
    | (Some(records), None)
    | (None, Some(records)) => Some(records)
    | (None, None) => raise(Not_found)
    }
  );

let rec getDataValue =
        (schema: schema, data: data, store: string, id: string, field: string)
        : option(recordValue) =>
  switch (get2(schema.formulae, store, field)) {
  | Some({fields, formula}) =>
    switch (
      List.map(fields, field => getDataValue(schema, data, store, id, field))
    ) {
    | values when values |. List.some(value => value == None) => None
    | values => values |. List.keepMap(v => v) |. formula |. Some
    }
  | None => get3(data, store, id, field)
  };

let rec getAllValues =
        (
          schema: schema,
          data: data,
          store: string,
          id: value,
          field: fieldPath,
        ) =>
  switch (field) {
  | [] => [id]
  | [field, ...path] =>
    switch (get2(schema.links, store, field), id) {
    | (Some(nextStore), Value(String(value))) =>
      (
        switch (getDataValue(schema, data, store, value, field)) {
        | None => raise(Not_found)
        | Some(SingleValue(value)) => [value]
        | Some(ListValue(value)) => value
        }
      )
      |. List.map(nextId =>
           getAllValues(schema, data, nextStore, nextId, path)
         )
      |. List.flatten
    | _ => raise(Not_found)
    }
  };

let idInFilter =
    (schema: schema, data: data, store: string, id: string, filter: filter) =>
  filter
  |. List.some(filterMap =>
       filterMap
       |. Map.every((field, range) =>
            getAllValues(schema, data, store, Value(String(id)), field)
            |. List.some(value =>
                 switch (range) {
                 | FilterPoint({value: Some(v)}) => value == v
                 | FilterRange({value: Some(startValue)}, _)
                     when
                       compareDirectionValues(
                         LowValue(Some(startValue)),
                         LowValue(Some(value)),
                       )
                       != (-1) =>
                   false
                 | FilterRange(_, {value: Some(endValue)})
                     when
                       compareDirectionValues(
                         HighValue(Some(endValue)),
                         HighValue(Some(value)),
                       )
                       != 1 =>
                   false
                 | FilterRange({value: Some(_)}, {value: Some(_)}) => true
                 | _ => raise(Not_found)
                 }
               )
          )
     );

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
  |. List.reduce(0, (res, (Asc(field) | Desc(field)) as sort) =>
       res != 0 ?
         res :
         (
           switch (
             getAllValues(schema, data, store, Value(String(id1)), field),
             getAllValues(schema, data, store, Value(String(id2)), field),
           ) {
           | ([], []) => 0
           | ([], _) => 1
           | (_, []) => (-1)
           | (values1, values2) =>
             (
               switch (sort) {
               | Asc(_) => 1
               | Desc(_) => (-1)
               }
             )
             * (
               List.makeBy(
                 max(List.length(values1), List.length(values2)), i =>
                 i
               )
               |. List.reduce(0, (res, i) =>
                    res != 0 ?
                      res :
                      (
                        switch (List.get(values1, i), List.get(values2, i)) {
                        | (value1, value2) when value1 == value2 => 0
                        | (Some(Value(value1)), Some(Value(value2))) =>
                          value1 < value2 ? (-1) : 1
                        | (Some(Null), Some(_))
                        | (_, None) => 1
                        | (Some(_), Some(Null))
                        | (None, _) => (-1)
                        }
                      )
                  )
             )
           }
         )
     );

let getSortedIds =
    (schema: schema, data: data, store: string, filter: filter, sort: sort) =>
  (
    switch (data |. Map.String.get(store)) {
    | Some(ids) => ids |. Map.String.keysToArray |. List.fromArray
    | None => []
    }
  )
  |. List.keep(id => idInFilter(schema, data, store, id, filter))
  |. List.sort(compareIds(schema, data, store, sort));

type changeType =
  | ChangeAdd
  | ChangeRemove;

let getDataChanges =
    (
      schema: schema,
      data: data,
      newData: nullData,
      store: string,
      filter: filter,
      sort: sort,
    ) => {
  let ids = getSortedIds(schema, data, store, filter, sort);
  let combined = mergeNullData(data, newData);
  let (changes, combinedIds) =
    (
      switch (newData |. Map.String.get(store)) {
      | Some(records) => records |. Map.String.keysToArray |. List.fromArray
      | None => []
      }
    )
    |. List.reduce(
         ([], ids),
         ((changes, ids), id) => {
           let (items, ids) =
             switch (indexOf(ids, id)) {
             | Some(index) =>
               let newIds = splice(ids, index, 1, []);
               (List.concat(changes, [(index, ChangeAdd)]), newIds);
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
             let newIds = splice(ids, index, 0, [id]);
             (List.concat(changes, [(index, ChangeRemove)]), newIds);
           } else {
             (items, ids);
           };
         },
       );
  (changes, (ids, combinedIds));
};

let applyDataChanges =
    (
      changes: list((int, changeType)),
      items: list('a),
      map: ('a, int, int) => 'a,
      reverse: bool,
    ) =>
  (reverse ? List.reverse(changes) : changes)
  |. List.reduce(items, (items, (index, changeType)) =>
       switch (changeType) {
       | ChangeAdd =>
         items |. List.map(item => map(item, index, reverse ? (-1) : 1))
       | ChangeRemove =>
         items |. List.map(item => map(item, index, reverse ? 1 : (-1)))
       }
     );

let updateRanges = (schema: schema, data: dataState, newData: nullData) =>
  Map.String.merge(data.ranges, newData, (store, ranges, records) =>
    switch (ranges, records) {
    | (None, _) => None
    | (Some(ranges), _) =>
      Some(
        ranges
        |. List.map(range =>
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