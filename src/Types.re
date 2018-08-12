open Belt;

type schema = Map.String.t(Map.String.t(string));

type value =
  | Bool(bool)
  | Int(int)
  | Float(float)
  | String(string)
  | Date(Js.Date.t);

type recordValue =
  | Single(option(value))
  | List(list(value))
  | LinkSingle(option(string))
  | LinkList(list(string));

type record = Map.String.t(recordValue);

type data = Map.String.t(Map.String.t(record));

type fieldPath = list(string);

type op =
  | Eq(value)
  | Neq(value)
  | Lt(value)
  | Gt(value)
  | Lte(value)
  | Gte(value)
  | In(list(value));

type filterLeaf = (fieldPath, op);

type filter =
  | And(list(filter))
  | Or(list(filter))
  | Filter(filterLeaf);

type dir =
  | Asc
  | Desc;

type sort = list((fieldPath, dir));

type slice = (int, option(int));

type search = {
  store: string,
  filter: option(filter),
  sort: option(sort),
  slice: option(slice),
  fields: list(field),
}
and field =
  | Field(fieldPath)
  | Search(string, search);

type query = list((string, search));

type nestedValue =
  | NestSingle(option(value))
  | NestList(list(value))
  | NestRecordSingle(option(Map.String.t(value)))
  | NestRecordList(list(Map.String.t(value)));

type modifyChanges =
  | ModifyInsert(int, list(nestedValue))
  | ModifyRemove(int, int);

type changes =
  | ReplaceSingle(nestedValue)
  | ModifyList(list(modifyChanges))
  | Changes(list((string, changes)));

module FieldCmp =
  Id.MakeComparable({
    type t = fieldPath;
    let cmp = compare;
  });

let makeFieldMap = items =>
  Map.fromArray(~id=(module FieldCmp), List.toArray(items));

type filterRange = (option(value), option(value));

type filterBox = Map.t(FieldCmp.t, filterRange, FieldCmp.identity);

module FilterCmp =
  Id.MakeComparable({
    type t = filterBox;
    let cmp = compare;
  });

let makeFilterSet = items =>
  Set.fromArray(~id=(module FilterCmp), List.toArray(items));

module FilterSetCmp =
  Id.MakeComparable({
    type t = Set.t(FilterCmp.t, FilterCmp.identity);
    let cmp = compare;
  });

let makeFilterSetMap = items =>
  Map.fromArray(~id=(module FilterSetCmp), List.toArray(items));

module SortCmp =
  Id.MakeComparable({
    type t = sort;
    let cmp = compare;
  });

let makeSortMap = items =>
  Map.fromArray(~id=(module SortCmp), List.toArray(items));

module SliceCmp =
  Id.MakeComparable({
    type t = slice;
    let cmp = compare;
  });

let makeSliceMap = items =>
  Map.fromArray(~id=(module SliceCmp), List.toArray(items));

type selectionField =
  | Leaf
  | Node(list((string, selectionField)));

type selection = {
  store: string,
  all: FilterSetCmp.t,
  pages:
    Map.t(
      FilterSetCmp.t,
      Map.t(
        SortCmp.t,
        Set.t(SliceCmp.t, SliceCmp.identity),
        SortCmp.identity,
      ),
      FilterSetCmp.identity,
    ),
  fields: selectionField,
  searches: list(selection),
};
/*
 type idChanges = {
   added: list(string),
   removed: list(string),
 };

 type changes = {
   ids: idChanges,
   /* fields: int, */
   searches: Map.Int.t(changes),
 }; */