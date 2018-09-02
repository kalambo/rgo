open Belt;
open Types;
open Utils;
open Data;

let intersectFilterMaps =
    (filter1: filterMap, filter2: filterMap)
    : option(filterMap) =>
  switch (
    Map.merge(filter1, filter2, (_, range1, range2) =>
      Some(
        switch (range1, range2) {
        | (Some(range), None)
        | (None, Some(range)) => Some(range)
        | (
            Some(FilterRange({value: Some(startValue)}, _)),
            Some(FilterRange(_, {value: Some(endValue)})),
          )
        | (
            Some(FilterRange(_, {value: Some(endValue)})),
            Some(FilterRange({value: Some(startValue)}, _)),
          )
            when
              compareDirectionValues(
                LowValue(Some(startValue)),
                HighValue(Some(endValue)),
              )
              == 1 =>
          None
        | (
            Some(
              FilterRange(
                {value: startValue1, fields: startFields1},
                {value: endValue1, fields: endFields1},
              ),
            ),
            Some(
              FilterRange(
                {value: startValue2, fields: startFields2},
                {value: endValue2, fields: endFields2},
              ),
            ),
          ) =>
          Some(
            FilterRange(
              {
                value:
                  switch (startValue1, startValue2) {
                  | (Some(Value(startValue1)), Some(Value(startValue2))) =>
                    Some(
                      Value(
                        startValue1 > startValue2 ? startValue1 : startValue2,
                      ),
                    )
                  | (Some(Null) | None, value)
                  | (value, Some(Null) | None) => value
                  },
                fields: unique(List.concat(startFields1, startFields2)),
              },
              {
                value:
                  switch (endValue1, endValue2) {
                  | (Some(Value(endValue1)), Some(Value(endValue2))) =>
                    Some(
                      Value(endValue1 < endValue2 ? endValue1 : endValue2),
                    )
                  | (Some(Null) | None, value)
                  | (value, Some(Null) | None) => value
                  },
                fields: unique(List.concat(endFields1, endFields2)),
              },
            ),
          )
        | (
            Some(FilterRange(rangeStart, rangeEnd)),
            Some(FilterPoint(point)),
          )
        | (
            Some(FilterPoint(point)),
            Some(FilterRange(rangeStart, rangeEnd)),
          ) =>
          switch (rangeStart, rangeEnd, point) {
          | ({value: Some(startValue)}, _, {value: Some(value)})
              when
                compareDirectionValues(
                  LowValue(Some(startValue)),
                  LowValue(Some(value)),
                )
                != (-1) =>
            None
          | (_, {value: Some(endValue)}, {value: Some(value)})
              when
                compareDirectionValues(
                  HighValue(Some(endValue)),
                  HighValue(Some(value)),
                )
                != 1 =>
            None
          | ({fields: startFields}, {fields: endFields}, {value, fields}) =>
            Some(
              FilterPoint({
                value,
                fields:
                  unique(List.flatten([startFields, endFields, fields])),
              }),
            )
          }
        | (
            Some(FilterPoint({value: Some(value1), fields: fields1})),
            Some(FilterPoint({value: Some(value2), fields: fields2})),
          ) =>
          value1 == value2 ?
            Some(
              FilterPoint({
                value: Some(value1),
                fields: unique(List.concat(fields1, fields2)),
              }),
            ) :
            None
        | (
            Some(FilterPoint({value: Some(value), fields: fields1})),
            Some(FilterPoint({fields: fields2})),
          )
        | (
            Some(FilterPoint({fields: fields1})),
            Some(FilterPoint({value: Some(value), fields: fields2})),
          ) =>
          Some(
            FilterPoint({
              value: Some(value),
              fields: unique(List.concat(fields1, fields2)),
            }),
          )
        | (
            Some(FilterPoint({fields: fields1})),
            Some(FilterPoint({fields: fields2})),
          ) =>
          Some(
            FilterPoint({
              value: None,
              fields: unique(List.concat(fields1, fields2)),
            }),
          )
        | (None, None) => None
        },
      )
    )
  ) {
  | filter when Map.some(filter, (_, value) => value == None) => None
  | filter =>
    Some(
      filter
      |. Map.toArray
      |. Array.keepMap(((key, value)) =>
           value |. mapSome(value => Some((key, value)))
         )
      |. Map.fromArray(~id=(module FieldCmp)),
    )
  };

let rec prepareFilter = (filter: userFilter) : filter =>
  switch (filter) {
  | FilterOr(filters) => filters |. List.map(prepareFilter) |. List.flatten
  | FilterAnd(filters) =>
    filters
    |. List.map(prepareFilter)
    |. List.reduce([Map.make(~id=(module FieldCmp))], (filters1, filters2) =>
         filters1
         |. List.map(filter1 =>
              filters2
              |. List.map(filter2 => intersectFilterMaps(filter1, filter2))
              |. List.keepMap(v => v)
            )
         |. List.flatten
       )
  | FilterIn(field, values) =>
    values
    |. List.map(value =>
         prepareFilter(FilterEq(field, FilterValue(value)))
       )
    |. List.flatten
  | FilterNeq(field, value) =>
    List.concat(
      prepareFilter(FilterLt(field, value)),
      prepareFilter(FilterGt(field, value)),
    )
  | FilterLte(field, value) =>
    List.concat(
      prepareFilter(FilterLt(field, value)),
      prepareFilter(FilterEq(field, value)),
    )
  | FilterGte(field, value) =>
    List.concat(
      prepareFilter(FilterGt(field, value)),
      prepareFilter(FilterEq(field, value)),
    )
  | FilterEq(field, value) => [
      Map.fromArray(
        ~id=(module FieldCmp),
        [|
          (
            field,
            FilterPoint(
              switch (value) {
              | FilterValue(value) => {value: Some(value), fields: []}
              | FilterVariable(field) => {value: None, fields: [field]}
              },
            ),
          ),
        |],
      ),
    ]
  | FilterLt(field, value) => [
      Map.fromArray(
        ~id=(module FieldCmp),
        [|
          (
            field,
            FilterRange(
              {value: None, fields: []},
              switch (value) {
              | FilterValue(value) => {value: Some(value), fields: []}
              | FilterVariable(field) => {value: None, fields: [field]}
              },
            ),
          ),
        |],
      ),
    ]
  | FilterGt(field, value) => [
      Map.fromArray(
        ~id=(module FieldCmp),
        [|
          (
            field,
            FilterRange(
              switch (value) {
              | FilterValue(value) => {value: Some(value), fields: []}
              | FilterVariable(field) => {value: None, fields: [field]}
              },
              {value: None, fields: []},
            ),
          ),
        |],
      ),
    ]
  };

let rec prepareSearch =
        ({name, store, filter, sort, slice, fields}: userSearch)
        : search => {
  name,
  store,
  filter:
    switch (filter) {
    | Some(filter) => prepareFilter(filter)
    | None => [Map.make(~id=(module FieldCmp))]
    },
  sort:
    switch (sort) {
    | Some(sort) =>
      List.some(sort, (Asc(field) | Desc(field)) => field == ["id"]) ?
        sort : List.concat(sort, [Asc(["id"])])
    | None => [Asc(["id"])]
    },
  slices:
    switch (slice) {
    | Some(slice) => [slice]
    | None => [(0, None)]
    },
  fields:
    fields
    |. List.keepMap(field =>
         switch (field) {
         | UserField(field) => Some(field)
         | UserSearch(_) => None
         }
       ),
  searches:
    fields
    |. List.keepMap(field =>
         switch (field) {
         | UserSearch(search) => Some(prepareSearch(search))
         | UserField(_) => None
         }
       ),
};