open Belt;
open Types;
open Utils;
open Data;

let intersectFilterMaps =
    (filter1: filterMap, filter2: filterMap)
    : option(filterMap) =>
  switch (
    merge(filter1, filter2, (_, range1, range2) =>
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
                fields: unique(Array.concat(startFields1, startFields2)),
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
                fields: unique(Array.concat(endFields1, endFields2)),
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
                  unique(
                    Array.concatMany([|startFields, endFields, fields|]),
                  ),
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
                fields: unique(Array.concat(fields1, fields2)),
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
              fields: unique(Array.concat(fields1, fields2)),
            }),
          )
        | (
            Some(FilterPoint({fields: fields1})),
            Some(FilterPoint({fields: fields2})),
          ) =>
          Some(
            FilterPoint({
              value: None,
              fields: unique(Array.concat(fields1, fields2)),
            }),
          )
        | (None, None) => None
        },
      )
    )
  ) {
  | filter when Array.some(filter, ((_, value)) => value == None) => None
  | filter =>
    Some(
      filter
      |. Array.keepMap(((key, value)) =>
           value |. mapSome(value => Some((key, value)))
         ),
    )
  };

let rec filterToMap = (filter, valueMap) : array(filterMap) =>
  switch (filter) {
  | FilterOr(filters) =>
    filters
    |. Array.map(filter => filterToMap(filter, valueMap))
    |. Array.concatMany
  | FilterAnd(filters) =>
    filters
    |. Array.map(filter => filterToMap(filter, valueMap))
    |. Array.reduce([||], (filters1, filters2) =>
         filters1
         |. Array.map(filter1 =>
              filters2
              |. Array.map(filter2 => intersectFilterMaps(filter1, filter2))
              |. Array.keepMap(v => v)
            )
         |. Array.concatMany
       )
  | FilterIn(field, values) =>
    values
    |. Array.map(value =>
         filterToMap(Filter(field, FilterEq, value), valueMap)
       )
    |. Array.concatMany
  | Filter(field, operation, value) =>
    switch (operation) {
    | FilterNeq =>
      Array.concat(
        filterToMap(Filter(field, FilterLt, value), valueMap),
        filterToMap(Filter(field, FilterGt, value), valueMap),
      )
    | FilterLte =>
      Array.concat(
        filterToMap(Filter(field, FilterLt, value), valueMap),
        filterToMap(Filter(field, FilterEq, value), valueMap),
      )
    | FilterGte =>
      Array.concat(
        filterToMap(Filter(field, FilterGt, value), valueMap),
        filterToMap(Filter(field, FilterEq, value), valueMap),
      )
    | FilterEq => [|[|(field, FilterPoint(valueMap(value)))|]|]
    | FilterLt => [|
        [|
          (
            field,
            FilterRange({value: None, fields: [||]}, valueMap(value)),
          ),
        |],
      |]
    | FilterGt => [|
        [|
          (
            field,
            FilterRange(valueMap(value), {value: None, fields: [||]}),
          ),
        |],
      |]
    }
  };

let getFilterValues = (filters: array(array(filterMap))) =>
  filters
  |. Array.concatMany
  |. Array.reduce([||], (valuesMap, filterMap) =>
       merge(valuesMap, filterMap, (_, values, range) =>
         unique(
           Array.concat(
             switch (values) {
             | Some(values) => values
             | None => [|LowValue(None), HighValue(None)|]
             },
             switch (range) {
             | Some(FilterPoint({value, fields})) =>
               Array.length(fields) == 0 ? [|LowValue(value)|] : [||]
             | Some(
                 FilterRange(
                   {value: startValue, fields: startFields},
                   {value: endValue, fields: endFields},
                 ),
               ) =>
               Array.length(startFields) == 0 && Array.length(endFields) == 0 ?
                 [|LowValue(startValue), HighValue(endValue)|] : [||]
             | None => [||]
             },
           ),
         )
         |. List.fromArray
         |. List.sort(compareDirectionValues)
         |. List.toArray
         |. Some
       )
     );

let splitFilterMap =
    (
      filterMap: filterMap,
      values: array((fieldPath, array(directionValue))),
    ) =>
  values
  |. Array.reduce([|filterMap|], (filterMaps, (field, values)) =>
       filterMaps
       |. Array.map(filterMap =>
            switch (
              switch (filterMap |. get(field)) {
              | Some(range) => range
              | None =>
                FilterRange(
                  {value: None, fields: [||]},
                  {value: None, fields: [||]},
                )
              }
            ) {
            | FilterPoint(_) => [|filterMap|]
            | FilterRange({fields: startFields}, {fields: endFields})
                when
                  Array.length(startFields) != 0
                  || Array.length(endFields) != 0 => [|
                filterMap,
              |]
            | FilterRange({value: startValue}, {value: endValue}) =>
              Array.mapWithIndex(
                values,
                (
                  index,
                  (LowValue(value) | HighValue(value)) as directionValue,
                ) =>
                switch (
                  compareDirectionValues(
                    directionValue,
                    LowValue(startValue),
                  ),
                  compareDirectionValues(
                    directionValue,
                    HighValue(endValue),
                  ),
                  values[index + 1],
                ) {
                | (
                    cmp1,
                    cmp2,
                    Some(LowValue(nextValue) | HighValue(nextValue)),
                  )
                    when cmp1 != (-1) && cmp2 != 1 =>
                  Array.concat(
                    [|
                      FilterRange(
                        {value, fields: [||]},
                        {value: nextValue, fields: [||]},
                      ),
                    |],
                    cmp2 == (-1) ?
                      [|
                        FilterRange(
                          {value: nextValue, fields: [||]},
                          {value: nextValue, fields: [||]},
                        ),
                      |] :
                      [||],
                  )
                | _ => [||]
                }
              )
              |. Array.concatMany
              |. Array.map(range => filterMap |. set(field, range))
            }
          )
       |. Array.concatMany
     );

let getSplitFilters = (filters: array(array(filterMap))) => {
  let values = getFilterValues(filters);
  filters
  |. Array.map(filter =>
       filter
       |. Array.map(filterMap => splitFilterMap(filterMap, values))
       |. Array.concatMany
       |. List.fromArray
       |. List.sort(compare)
       |. List.toArray
     );
};

let filterFromMap = (filter: array(filterMap)) : filter(filterVariable) =>
  FilterOr(
    filter
    |. Array.map(filterMap =>
         FilterAnd(
           filterMap
           |. Array.map(((field, range)) =>
                switch (range) {
                | FilterPoint({value, fields}) =>
                  FilterAnd(
                    Array.concat(
                      value
                      |. mapSome(value => Some(FilterValue(value)))
                      |. noneToEmpty,
                      fields |. Array.map(field => FilterVariable(field)),
                    )
                    |. Array.map(v => Filter(field, FilterEq, v)),
                  )
                | FilterRange(
                    {value: value1, fields: fields1},
                    {value: value2, fields: fields2},
                  ) =>
                  FilterAnd(
                    Array.concat(
                      Array.concat(
                        value1
                        |. mapSome(value => Some(FilterValue(value)))
                        |. noneToEmpty,
                        fields1 |. Array.map(field => FilterVariable(field)),
                      )
                      |. Array.map(v => Filter(field, FilterGt, v)),
                      Array.concat(
                        value2
                        |. mapSome(value => Some(FilterValue(value)))
                        |. noneToEmpty,
                        fields2 |. Array.map(field => FilterVariable(field)),
                      )
                      |. Array.map(v => Filter(field, FilterLt, v)),
                    ),
                  )
                }
              ),
         )
       ),
  );