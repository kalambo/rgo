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

type operation =
  | FilterNeq
  | FilterLte
  | FilterGte
  | FilterEq
  | FilterLt
  | FilterGt;

type filterVariable =
  | FilterValue(value)
  | FilterVariable(string);

type filter('a) =
  | FilterOr(array(filter('a)))
  | FilterAnd(array(filter('a)))
  | FilterIn(fieldPath, array('a))
  | Filter(fieldPath, operation, 'a);

type sortPart =
  | Asc(fieldPath)
  | Desc(fieldPath);

type sort = array(sortPart);

type slice = (int, option(int));

type search = {
  name: string,
  store: string,
  filter: filter(filterVariable),
  sort,
  slices: array(slice),
  fields: array(fieldPath),
  searches: array(search),
};

type record = keyMap(recordValue);

type data = keyMap(keyMap(record));

type nullData = keyMap(keyMap(option(record)));

type rangeStart =
  | RangeFirst
  | RangeIndex(int, string);

type range = (rangeStart, option(int));

type ranges =
  | FullRange(filter(value))
  | PartialRange(filter(value), sort, array(range));

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