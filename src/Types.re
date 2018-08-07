open Belt;
/*
 type scalar =
   | Bool_
   | Int_
   | Float_
   | String_
   | Date_
   | Link_(string)
   | BoolList_
   | IntList_
   | FloatList_
   | StringList_
   | DateList_
   | LinkList_(string);

 type value =
   | Bool(bool)
   | Int(int)
   | Float(float)
   | String(string)
   | Date(Js.Date.t)
   | Link(string)
   | BoolList(list(bool))
   | IntList(list(int))
   | FloatList(list(float))
   | StringList(list(string))
   | DateList(list(Js.Date.t))
   | LinkList(list(string)); */

type dir =
  | Asc
  | Desc;

module FieldCmp =
  Id.MakeComparable({
    type t = list(string);
    let cmp = compare;
  });

let makeFieldMap = items =>
  Map.fromArray(~id=(module FieldCmp), List.toArray(items));

module FilterCmp =
  Id.MakeComparable({
    type t =
      Map.t(FieldCmp.t, (option(int), option(int)), FieldCmp.identity);
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
    type t = list((dir, list(string)));
    let cmp = compare;
  });

let makeSortMap = items =>
  Map.fromArray(~id=(module SortCmp), List.toArray(items));

module SliceCmp =
  Id.MakeComparable({
    type t = (int, option(int));
    let cmp = compare;
  });

let makeSliceMap = items =>
  Map.fromArray(~id=(module SliceCmp), List.toArray(items));

type op =
  | Eq(int)
  | Neq(int)
  | Lt(int)
  | Gt(int)
  | Lte(int)
  | Gte(int)
  | In(list(int));

type filterLeaf = (list(string), op);

type filter =
  | And(list(filter))
  | Or(list(filter))
  | Leaf(filterLeaf);

type search = {
  store: string,
  filter: option(filter),
  sort: option(list((dir, list(string)))),
  slice: option((int, option(int))),
  fields: list(field),
}
and field =
  | Field(list(string))
  | Search(string, search);

type ledger =
  Belt.Map.String.t(
    Belt.Map.t(
      FilterSetCmp.t,
      (
        option(ledgerFields),
        Belt.Map.t(
          SortCmp.t,
          Belt.Map.t(SliceCmp.t, ledgerFields, SliceCmp.identity),
          SortCmp.identity,
        ),
      ),
      FilterSetCmp.identity,
    ),
  )
and ledgerFields = {
  scalars: Belt.Set.t(FieldCmp.t, FieldCmp.identity),
  searches: ledger,
};