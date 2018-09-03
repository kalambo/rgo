open Belt;

type nonNullValue =
  | Bool(bool)
  | Int(int)
  | Float(float)
  | String(string)
  | Date(Js.Date.t);

type value =
  | Null
  | Value(nonNullValue);

type directionValue =
  | LowValue(option(value))
  | HighValue(option(value));

type recordValue =
  | SingleValue(value)
  | ListValue(list(value));

type formula = {
  fields: list(string),
  formula: list(recordValue) => recordValue,
};

type schema = {
  links: Map.String.t(Map.String.t(string)),
  formulae: Map.String.t(Map.String.t(formula)),
};

type fieldPath = list(string);

module FieldCmp =
  Id.MakeComparable({
    type t = fieldPath;
    let cmp = compare;
  });

type filterValue = {
  value: option(value),
  fields: list(string),
};

type filterRange =
  | FilterPoint(filterValue)
  | FilterRange(filterValue, filterValue);

type filterMap = Map.t(FieldCmp.t, filterRange, FieldCmp.identity);

type filter = list(filterMap);

type userFilterValue =
  | FilterValue(value)
  | FilterVariable(string);

type userFilter =
  | FilterOr(list(userFilter))
  | FilterAnd(list(userFilter))
  | FilterIn(fieldPath, list(value))
  | FilterNeq(fieldPath, userFilterValue)
  | FilterLte(fieldPath, userFilterValue)
  | FilterGte(fieldPath, userFilterValue)
  | FilterEq(fieldPath, userFilterValue)
  | FilterLt(fieldPath, userFilterValue)
  | FilterGt(fieldPath, userFilterValue);

type sortPart =
  | Asc(fieldPath)
  | Desc(fieldPath);

type sort = list(sortPart);

type slice = (int, option(int));

type search = {
  name: string,
  store: string,
  filter,
  sort,
  slices: list(slice),
  fields: list(fieldPath),
  searches: list(search),
};

type userSearch = {
  name: string,
  store: string,
  filter: option(userFilter),
  sort: option(sort),
  slice: option(slice),
  fields: list(userField),
}
and userField =
  | UserField(fieldPath)
  | UserSearch(userSearch);

type record = Map.String.t(recordValue);

type data = Map.String.t(Map.String.t(record));

type nullData = Map.String.t(Map.String.t(option(record)));

type rangeStart =
  | RangeFirst
  | RangeIndex(int, string);

type range = (rangeStart, option(int));

type ranges =
  | FullRange(filter)
  | PartialRange(filter, sort, list(range));

type dataState = {
  server: data,
  client: nullData,
  ranges: Map.String.t(list(ranges)),
};

type runValue =
  | RunValue(value)
  | RunRecord(array((string, runRecordValue)))
and runRecordValue =
  | RunSingle(runValue)
  | RunList(array(option(runValue)));

type listChange('a, 'b) =
  | ListAdd(int, array('a))
  | ListChange(int, 'b)
  | ListRemove(int, int);

type changeValue =
  | ChangeValue(runValue)
  | ChangeRecord(array((string, change)))
and change =
  | ChangeClear
  | ChangeSetSingle(runValue)
  | ChangeSetList(array(option(runValue)))
  | ChangeSingle(array((string, change)))
  | ChangeList(array(listChange(option(runValue), changeValue)));

type userChange;

type state = {
  schema,
  queries: list((list(search), userChange => unit)),
  data: dataState,
  requests: Map.Int.t(list(search)),
  index: int,
};