type keyMap('a) = array((string, 'a));

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
  | ArrayValue(array(value));

type formula = {
  fields: array(string),
  formula: array(recordValue) => recordValue,
};

type schema = {
  links: keyMap(keyMap(string)),
  formulae: keyMap(keyMap(formula)),
};

type fieldPath = array(string);

type filterValue = {
  value: option(value),
  fields: array(string),
};

type filterRange =
  | FilterPoint(filterValue)
  | FilterRange(filterValue, filterValue);

type filterMap = array((fieldPath, filterRange));

type filter = array(filterMap);

type userFilterValue =
  | FilterValue(value)
  | FilterVariable(string);

type userFilter =
  | FilterOr(array(userFilter))
  | FilterAnd(array(userFilter))
  | FilterIn(fieldPath, array(value))
  | FilterNeq(fieldPath, userFilterValue)
  | FilterLte(fieldPath, userFilterValue)
  | FilterGte(fieldPath, userFilterValue)
  | FilterEq(fieldPath, userFilterValue)
  | FilterLt(fieldPath, userFilterValue)
  | FilterGt(fieldPath, userFilterValue);

type sortPart =
  | Asc(fieldPath)
  | Desc(fieldPath);

type sort = array(sortPart);

type slice = (int, option(int));

type search = {
  name: string,
  store: string,
  filter,
  sort,
  slices: array(slice),
  fields: array(fieldPath),
  searches: array(search),
};

type userSearch = {
  name: string,
  store: string,
  filter: option(userFilter),
  sort: option(array(sortPart)),
  slice: option(slice),
  fields: array(userField),
}
and userField =
  | UserField(fieldPath)
  | UserSearch(userSearch);

type record = keyMap(recordValue);

type data = keyMap(keyMap(record));

type nullData = keyMap(keyMap(option(record)));

type rangeStart =
  | RangeFirst
  | RangeIndex(int, string);

type range = (rangeStart, option(int));

type ranges =
  | FullRange(filter)
  | PartialRange(filter, sort, array(range));

type dataState = {
  server: data,
  client: nullData,
  ranges: keyMap(array(ranges)),
};

type runValue =
  | RunValue(value)
  | RunRecord(keyMap(runRecordValue))
and runRecordValue =
  | RunSingle(runValue)
  | RunArray(array(option(runValue)));

type arrayChange('a, 'b) =
  | ArrayAdd(int, array('a))
  | ArrayChange(int, 'b)
  | ArrayRemove(int, int);

type changeValue =
  | ChangeValue(runValue)
  | ChangeRecord(keyMap(change))
and change =
  | ChangeClear
  | ChangeSetSingle(runValue)
  | ChangeSetArray(array(option(runValue)))
  | ChangeSingle(keyMap(change))
  | ChangeArray(array(arrayChange(option(runValue), changeValue)));

type state = {
  schema,
  queries: array((array(search), changeValue => unit)),
  data: dataState,
  requests: array((int, array(search))),
  index: int,
};