open Belt;
open Types;

let eq = (a, b) => a == b;

let must = value =>
  switch (value) {
  | Some(value) => value
  | None => raise(Not_found)
  };

let mapSome = (value, map) =>
  switch (value) {
  | Some(value) => map(value)
  | None => None
  };

let emptyToNone = items =>
  switch (items) {
  | [||] => None
  | items => Some(items)
  };

let noneToEmpty = value =>
  switch (value) {
  | Some(value) => [|value|]
  | None => [||]
  };

let unique = items =>
  items
  |. Array.keep(item =>
       items |. Array.keep(x => x == item) |. Array.length == 1
     );

let uniqueStrings = items =>
  items |. Set.String.fromArray |. Set.String.toArray;

let getKeys = items => items |. Array.map(((key, _)) => key);

let find = (items, test) =>
  items
  |. Array.reduce(None, (res, item) =>
       res == None && test(item) ? Some(item) : res
     );

let indexOf = (items, item) =>
  items
  |. Array.mapWithIndex((index, x) => (index, x))
  |. Array.reduce(None, (res, (index, x)) =>
       res == None && x == item ? Some(index) : res
     );

let get = (items, key) =>
  items
  |. Array.reduce(None, (res, (k, v)) =>
       res == None && k == key ? Some(v) : res
     );

let set = (items, key, value) =>
  items |. Array.map(((k, v)) => (k, k == key ? value : v));

let update = (items, key, map) =>
  items |. Array.map(((k, v)) => (k, k == key ? map(v) : v));

let remove = (items, key) =>
  items |. Array.keepMap(((k, v)) => k == key ? None : Some((k, v)));

let get2 = (value, key1, key2) =>
  switch (value |. get(key1)) {
  | Some(value) => value |. get(key2)
  | None => None
  };

let get3 = (map, key1, key2, key3) =>
  switch (get2(map, key1, key2)) {
  | Some(value) => value |. get(key3)
  | None => None
  };

let containsAll = (container: array('a), items: array('a)) =>
  Array.every(items, x => Array.some(container, y => x == y));

let take = (items: array('a)) =>
  switch (items |. Array.get(0)) {
  | Some(value) => Some((value, items |. Array.sliceToEnd(1)))
  | None => None
  };

let slice = (items, startIndex, endIndex) =>
  Array.range(
    startIndex,
    switch (endIndex) {
    | Some(endIndex) => endIndex
    | None => Array.length(items)
    },
  )
  |. Array.map(index => items |. Array.get(index));

let splice = (items: array('a), index: int, remove: int, add: array('a)) =>
  Array.concatMany([|
    items |. Array.slice(~offset=0, ~len=index),
    add,
    items |. Array.sliceToEnd(index + remove),
  |]);

let rec binarySearch =
        (
          items: array('a),
          item: 'a,
          cmp: ('a, 'a) => int,
          ~startIndex=0,
          ~endIndex=Array.length(items),
          (),
        ) =>
  if (Array.length(items) == 0) {
    (-1);
  } else {
    let pivot = (startIndex + endIndex) / 2;
    let c = cmp(item, must(items[pivot]));
    if (endIndex - startIndex <= 1) {
      c > 0 ? pivot : pivot - 1;
    } else if (c == 0) {
      pivot - 1;
    } else {
      c > 0 ?
        binarySearch(items, item, cmp, ~startIndex=pivot, ~endIndex, ()) :
        binarySearch(items, item, cmp, ~startIndex, ~endIndex=pivot, ());
    };
  };
let locationOf = (items: array('a), item: 'a, cmp: ('a, 'a) => int) =>
  binarySearch(items, item, cmp, ()) + 1;

let mapFlattened =
    (itemsArray: array(array('a)), map: array('a) => array('b)) => {
  let (indices, values) =
    itemsArray
    |. Array.mapWithIndex((index, items) =>
         items |. Array.map(item => (index, item))
       )
    |. Array.concatMany
    |. Array.unzip;
  let mappedValues = Array.zip(indices, map(values));
  itemsArray
  |. Array.mapWithIndex((index, _) =>
       mappedValues
       |. Array.keepMap(((i, value)) => i == index ? Some(value) : None)
     );
};

let groupBy = (items: array('a), map: (int, 'a) => ('b, 'c)) =>
  items
  |. Array.mapWithIndex((index, item) => (index, item))
  |. Array.reduce(
       [||],
       (result, (index, item)) => {
         let (group, value) = map(index, item);
         result
         |. update(group, groupItems =>
              Array.concat([|value|], groupItems)
              |. List.fromArray
              |. List.sort(compare)
              |. List.toArray
            );
       },
     );

let groupByArray = (items: array('a), map: (int, 'a) => (array('b), 'c)) =>
  items
  |. Array.mapWithIndex((index, item) => (index, item))
  |. Array.reduce(
       [||],
       (result, (index, item)) => {
         let (groups, value) = map(index, item);
         groups
         |. Array.reduce(result, (res, group) =>
              res
              |. update(group, indexedItems =>
                   Array.concat([|value|], indexedItems)
                   |. List.fromArray
                   |. List.sort(compare)
                   |. List.toArray
                 )
            );
       },
     );

let mapGroups =
    (
      items: array('a),
      groupMap: 'a => 'b,
      map: (array('a), 'b) => array('c),
    ) => {
  let mappedItems =
    groupBy(items, (index, item) => (groupMap(item), (index, item)))
    |. Array.map(((value, indexedItems)) => {
         let (indices, items) = indexedItems |. Array.unzip;
         Array.zip(indices, map(items, value));
       })
    |. Array.concatMany;
  items |. Array.mapWithIndex((index, _) => must(mappedItems |. get(index)));
};

let mapArrayGroups =
    (
      items: array('a),
      groupMap: 'a => array('b),
      map: (array('a), array('b)) => array('c),
    ) => {
  let mappedValues =
    groupByArray(items, (index, item) => (groupMap(item), (index, item)))
    |. groupBy((_, (value, indexedItems)) => (indexedItems, value))
    |. Array.map(((indexedItems, values)) => {
         let (indices, items) = indexedItems |. Array.unzip;
         Array.zip(indices, map(items, values));
       })
    |. Array.concatMany;
  items
  |. Array.mapWithIndex((index, _) =>
       mappedValues
       |. Array.keepMap(((i, value)) => i == index ? Some(value) : None)
     );
};

let merge = (map1, map2, mergeMap) =>
  Array.concat(map1 |. getKeys, map2 |. getKeys)
  |. unique
  |. Array.keepMap(key =>
       mergeMap(key, map1 |. get(key), map2 |. get(key))
       |. mapSome(value => Some((key, value)))
     );

let mergeMaps = (map1, map2, mergeValues) =>
  Array.concat(map1 |. getKeys, map2 |. getKeys)
  |. unique
  |. Array.keepMap(key =>
       (
         switch (map1 |. get(key), map2 |. get(key)) {
         | (Some(value1), Some(value2)) => mergeValues(value1, value2)
         | (Some(value), None)
         | (None, Some(value)) => Some(value)
         | (None, None) => None
         }
       )
       |. mapSome(value => Some((key, value)))
     );

let mergeConvertMaps = (map1, map2, convert, mergeValues) =>
  Array.concat(map1 |. getKeys, map2 |. getKeys)
  |. uniqueStrings
  |. Array.keepMap(key =>
       (
         switch (map1 |. get(key), map2 |. get(key)) {
         | (Some(value1), Some(value2)) => mergeValues(value1, value2)
         | (Some(value), None) => Some(value)
         | (None, Some(value)) => convert(value)
         | (None, None) => None
         }
       )
       |. mapSome(value => Some((key, value)))
     );

[@bs.deriving abstract]
type diffChange('a) = {
  added: bool,
  removed: bool,
  count: int,
  value: array('a),
};

[@bs.module "diff"]
external diffArrays : (array('a), array('a)) => array(diffChange('a)) =
  "diffArrays";

let diff = (items1, items2) =>
  diffArrays(items1, items2)
  |. Array.reduce(([||], 0), ((changes, index), change) =>
       if (addedGet(change)) {
         (
           Array.concat([|ArrayAdd(index, valueGet(change))|], changes),
           index + countGet(change),
         );
       } else if (removedGet(change)) {
         (
           Array.concat([|ArrayRemove(index, countGet(change))|], changes),
           index,
         );
       } else {
         (
           Array.concat(
             [|ArrayChange(index, items1 |. Array.get(index) |. must)|],
             changes,
           ),
           index + 1,
         );
       }
     )
  |. fst;