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

let mapPair = ((v1, v2), f1, f2) => (f1(v1), f2(v2));

let emptyToNone = items =>
  switch (items) {
  | [] => None
  | items => Some(items)
  };

let emptyArrayToNone = items =>
  switch (items) {
  | [||] => None
  | items => Some(items)
  };

let noneToEmpty = value =>
  switch (value) {
  | Some(value) => [value]
  | None => []
  };

let rec unique = (items: list('a)) =>
  switch (items) {
  | [] => []
  | [x, ...other] =>
    let otherUnique = unique(other);
    List.some(otherUnique, y => y == x) ? otherUnique : [x, ...otherUnique];
  };

let get2 = (map, key1, key2) =>
  switch (Map.String.get(map, key1)) {
  | Some(value) => Map.String.get(value, key2)
  | None => None
  };

let get3 = (map, key1, key2, key3) =>
  switch (get2(map, key1, key2)) {
  | Some(value) => Map.String.get(value, key3)
  | None => None
  };

let listContainsAll = (container: list('a), items: list('a)) =>
  List.every(items, x => List.some(container, y => x == y));

let rec indexOf = (~current: int=0, items: list('a), value: 'a) =>
  switch (items) {
  | [] => None
  | [item, ...items] =>
    item == value ?
      Some(current) : indexOf(~current=current + 1, items, value)
  };

let slice = (items: list('a), startIndex: int, endIndex: option(int)) =>
  List.makeBy(
    (
      switch (endIndex) {
      | Some(endIndex) => endIndex
      | None => List.length(items)
      }
    )
    - startIndex,
    index =>
    List.get(items, index + startIndex)
  );

let rec splice = (items: list('a), index: int, remove: int, add: list('a)) =>
  switch (index) {
  | 0 =>
    switch (remove) {
    | 0 => List.concat(add, items)
    | _ =>
      switch (items) {
      | [] => raise(Not_found)
      | [_, ...items] => splice(items, 0, remove - 1, add)
      }
    }
  | _ =>
    switch (items) {
    | [] => raise(Not_found)
    | [item, ...items] => [item, ...splice(items, index - 1, remove, add)]
    }
  };

let rec binarySearch =
        (
          items: list('a),
          item: 'a,
          cmp: ('a, 'a) => int,
          ~startIndex=0,
          ~endIndex=List.length(items),
          (),
        ) =>
  if (List.length(items) == 0) {
    (-1);
  } else {
    let pivot = (startIndex + endIndex) / 2;
    let c = cmp(item, must(List.get(items, pivot)));
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
let locationOf = (items: list('a), item: 'a, cmp: ('a, 'a) => int) =>
  binarySearch(items, item, cmp, ()) + 1;

let mapFlattened = (itemsList: list(list('a)), map: list('a) => list('b)) => {
  let (indices, values) =
    itemsList
    |. List.mapWithIndex((index, items) =>
         items |. List.map(item => (index, item))
       )
    |. List.flatten
    |. List.unzip;
  let mappedValues = List.zip(indices, map(values));
  itemsList
  |. List.mapWithIndex((index, _) =>
       mappedValues
       |. List.keepMap(((i, value)) => i == index ? Some(value) : None)
     );
};

let groupBy = (items: list('a), map: (int, 'a) => ('b, 'c)) =>
  items
  |. List.mapWithIndex((index, item) => (index, item))
  |. List.reduce(
       [],
       (result, (index, item)) => {
         let (group, value) = map(index, item);
         List.setAssoc(
           result,
           group,
           switch (List.getAssoc(result, group, eq)) {
           | Some(groupItems) =>
             [value, ...groupItems] |. List.sort(compare)
           | None => [value]
           },
           eq,
         );
       },
     );

let groupByList = (items: list('a), map: (int, 'a) => (list('b), 'c)) =>
  items
  |. List.mapWithIndex((index, item) => (index, item))
  |. List.reduce(
       [],
       (result, (index, item)) => {
         let (groups, value) = map(index, item);
         groups
         |. List.reduce(result, (res, group) =>
              List.setAssoc(
                res,
                group,
                switch (List.getAssoc(result, group, eq)) {
                | Some(indexedItems) =>
                  [value, ...indexedItems] |. List.sort(compare)
                | None => [value]
                },
                eq,
              )
            );
       },
     );

let mapGroups =
    (items: list('a), groupMap: 'a => 'b, map: (list('a), 'b) => list('c)) => {
  let mappedItems =
    groupBy(items, (index, item) => (groupMap(item), (index, item)))
    |. List.map(((value, indexedItems)) => {
         let (indices, items) = indexedItems |. List.unzip;
         List.zip(indices, map(items, value));
       })
    |. List.flatten;
  items
  |. List.mapWithIndex((index, _) =>
       must(List.getAssoc(mappedItems, index, eq))
     );
};

let mapListGroups =
    (
      items: list('a),
      groupMap: 'a => list('b),
      map: (list('a), list('b)) => list('c),
    ) => {
  let mappedValues =
    groupByList(items, (index, item) => (groupMap(item), (index, item)))
    |. groupBy((_, (value, indexedItems)) => (indexedItems, value))
    |. List.map(((indexedItems, values)) => {
         let (indices, items) = indexedItems |. List.unzip;
         List.zip(indices, map(items, values));
       })
    |. List.flatten;
  items
  |. List.mapWithIndex((index, _) =>
       mappedValues
       |. List.keepMap(((i, value)) => i == index ? Some(value) : None)
     );
};

let mergeMaps = (map1, map2, mergeValues) =>
  Map.String.merge(map1, map2, (_, value1, value2) =>
    switch (value1, value2) {
    | (Some(value1), Some(value2)) => mergeValues(value1, value2)
    | (Some(value), None)
    | (None, Some(value)) => Some(value)
    | (None, None) => None
    }
  );

let mergeConvertMaps = (map1, map2, convert, mergeValues) =>
  Map.String.merge(map1, map2, (_, value1, value2) =>
    switch (value1, value2) {
    | (Some(value1), Some(value2)) => mergeValues(value1, value2)
    | (Some(value), None) => Some(value)
    | (None, Some(value)) => convert(value)
    | (None, None) => None
    }
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
  |. Array.reduce(([], 0), ((changes, index), change) =>
       if (addedGet(change)) {
         (
           [ListAdd(index, valueGet(change)), ...changes],
           index + countGet(change),
         );
       } else if (removedGet(change)) {
         ([ListRemove(index, countGet(change)), ...changes], index);
       } else {
         (
           [
             ListChange(index, items1 |. Array.get(index) |. must),
             ...changes,
           ],
           index + 1,
         );
       }
     )
  |. fst;