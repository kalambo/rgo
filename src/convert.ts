import {
  Change,
  Field,
  Filter,
  FilterUnit,
  LinkField,
  ListChange,
  NullData,
  Obj,
  Ranges,
  Record,
  RequestSearch,
  Scalar,
  ScalarField,
  Schema,
  SetRecord,
  SetValue,
  SortPart,
  Value,
} from './typings';

const notObject = (x): x is Value =>
  Object.prototype.toString.call(x) !== '[object Object]';

const objectToPairs = (obj, map) => {
  const result = Object.keys(obj)
    .map(key => {
      const value = map(key);
      return value && [key, value];
    })
    .filter(x => x);
  return result.length === 0 ? undefined : result;
};

const jsToVariant = (tag, ...args) => {
  if (args.length === 0) return tag;
  (args as any).tag = tag;
  return args;
};

const getScalar = (schema: Schema, store: string, [field, ...path]: string[]) =>
  (path.reduce((res, field) => schema[(res as LinkField).store][field], schema[
    store
  ][field] as Field) as ScalarField).scalar;

const buildObject = (pairs, valueMap) =>
  pairs.reduce((res, [key, value]) => ({ ...res, [key]: valueMap(value) }), {});

const variantToJs = <T>(enums, values): ((x) => T) => x => {
  if (x === undefined) return undefined;
  if (typeof x === 'number') return enums[x];
  return values[x.tag](...x);
};

// nonNullValue =
//   | Bool(bool)
//   | Int(int)
//   | Float(float)
//   | String(string)
//   | Date(Js.Date.t)
const nonNullValueToRe = (scalar: Scalar) => (value: Value) => {
  switch (scalar) {
    case 'bool':
      return jsToVariant(0, value);
    case 'int':
      return jsToVariant(1, value);
    case 'float':
      return jsToVariant(2, value);
    case 'string':
      return jsToVariant(3, value);
    case 'date':
      return jsToVariant(4, (value as Date).getTime());
  }
};
const nonNullValueToJs = variantToJs<Value>(
  [],
  [x => x, x => x, x => x, x => x, x => new Date(x)],
);

// value =
//   | Null
//   | Value(nonNullValue)
const valueToRe = (scalar: Scalar) => (value: Value) =>
  value === null
    ? jsToVariant(0)
    : jsToVariant(0, nonNullValueToRe(scalar)(value));
const valueToJs = variantToJs<Value>([null], [nonNullValueToJs]);

// recordValue =
//   | SingleValue(value)
//   | ArrayValue(array(value))
const recordValueToRe = (scalar: Scalar) => (value: Value | Value[]) =>
  Array.isArray(value)
    ? jsToVariant(1, value.map(valueToRe(scalar)))
    : jsToVariant(0, valueToRe(scalar)(value));
const recordValueToJs = variantToJs<Value | Value[]>(
  [],
  [valueToJs, v => v.map(valueToJs)],
);

// runValue =
//   | RunValue(value)
//   | RunRecord(keyMap(runRecordValue))
const runValueToJs = variantToJs<SetValue>(
  [],
  [valueToJs, x => buildObject(x, runRecordValueToJs)],
);

// runRecordValue =
//   | RunSingle(runValue)
//   | RunList(array(option(runValue)))
const runRecordValueToJs = variantToJs<SetRecord[string]>(
  [],
  [runValueToJs, x => x.map(runValueToJs)],
);

// listChange('a, 'b) =
//   | ListAdd(int, array('a))
//   | ListChange(int, 'b)
//   | ListRemove(int, int)
const listChangeToJs = <A, B>(addToJs, changeToJs) =>
  variantToJs<ListChange<A, B>>(
    [],
    [
      (index, v) => ({ index, add: v.map(addToJs) }),
      (index, v) => ({ index, change: changeToJs(v) }),
      (index, v) => ({ index, remove: v }),
    ],
  );

// changeValue =
//   | ChangeValue(runValue)
//   | ChangeRecord(keyMap(change))
const changeValueToJs = variantToJs<Change>(
  [],
  [runValueToJs, x => buildObject(x, changeToJs)],
);

// change =
//   | ChangeClear
//   | ChangeSetSingle(runValue)
//   | ChangeSetArray(array(option(runValue)))
//   | ChangeSingle(keyMap(change))
//   | ChangeArray(array(arrayChange(option(runValue), changeValue)))
const changeToJs = variantToJs<Change[string]>(
  [undefined],
  [
    runValueToJs,
    x => x.map(runValueToJs),
    x => buildObject(x, changeToJs),
    x => x.map(listChangeToJs(runValueToJs, changeValueToJs)),
  ],
);

// type operation =
//   | FilterNeq
//   | FilterLte
//   | FilterGte
//   | FilterEq
//   | FilterLt
//   | FilterGt
const operationToRe = (operation: '=' | '!=' | '<' | '>' | '<=' | '>=') =>
  jsToVariant(['!=', '<=', '>=', '=', '<', '>'].indexOf(operation));
const operationToJs = variantToJs<'=' | '!=' | '<' | '>' | '<=' | '>='>(
  ['!=', '<=', '>=', '=', '<', '>'],
  [],
);

// type filterVariable =
//   | FilterValue(value)
//   | FilterVariable(string)
const filterValueToRe = (scalar: Scalar) => (
  value: Value | { field: string },
) =>
  notObject(value)
    ? jsToVariant(0, valueToRe(scalar)(value))
    : jsToVariant(1, value.field);
const filterVariableToJs = variantToJs<Value | { field: string }>(
  [],
  [x => x, x => ({ field: x })],
);

// type filter('a) =
//   | FilterOr(array(filter('a)))
//   | FilterAnd(array(filter('a)))
//   | FilterIn(fieldPath, array('a))
//   | Filter(fieldPath, operation, 'a)
const filterToRe = (filter: Filter, valueToRe) => {
  if (filter[0] === 'OR' || filter[0] === 'AND') {
    const [type, ...filters] = filter;
    return jsToVariant(
      type === 'OR' ? 0 : 1,
      filters.map(f => filterToRe(f as Filter, valueToRe)),
    );
  }
  const [field, operation, value] = filter as FilterUnit;
  const fieldPath = field.split('.');
  if (operation === 'in') {
    return jsToVariant(
      2,
      fieldPath,
      (value as any[]).map(valueToRe(fieldPath)),
    );
  }
  return jsToVariant(
    3,
    fieldPath,
    operationToRe(operation),
    valueToRe(fieldPath)(value),
  );
};
const filterToJs = valueToJs =>
  variantToJs<Filter>(
    [],
    [
      x => ['OR', ...x.map(filterToJs(valueToJs))],
      x => ['AND', ...x.map(filterToJs(valueToJs))],
      (x, y) => [x, 'in', y.map(valueToJs)],
      (x, y, z) => [x, operationToJs(y), valueToJs(z)],
    ],
  );

// sortPart =
//   | Asc(fieldPath)
//   | Desc(fieldPath)
const sortPartToRe = (sort: SortPart) =>
  jsToVariant(sort.direction === 'ASC' ? 0 : 1, sort.field);
const sortPartToJs = variantToJs<SortPart>(
  [],
  [
    x => ({ direction: 'ASC', field: x }),
    x => ({ direction: 'DESC', field: x }),
  ],
);

// search = {
//   name: string,
//   store: string,
//   filter: filter(filterVariable),
//   sort: array(sortPart),
//   slices: array(slice),
//   fields: array(fieldPath),
//   searches: array(search),
// }
const searchToRe = (
  schema: Schema,
  { name, store, filter, sort, slices, fields, searches }: RequestSearch,
) => [
  name,
  store,
  filterToRe(filter, field => filterValueToRe(getScalar(schema, store, field))),
  sort.map(sortPartToRe),
  slices.map(({ start, end }) => [start, end]),
  fields,
  searches,
];
const searchToJs = ([name, store, filter, sort, slices, fields, searches]) =>
  ({
    name,
    store,
    filter: filterToJs(filterVariableToJs)(filter),
    sort: sort.map(sortPartToJs),
    slices: slices.map(([start, end]) => ({ start, end })),
    fields,
    searches: searches.map(searchToJs),
  } as RequestSearch);

// type rangeStart =
//   | RangeFirst
//   | RangeIndex(int, string)
// type range = (rangeStart, option(int))
const rangeToRe = (range: Range) => {
  const { id, start, end } = range as any;
  return [id ? jsToVariant(1, start, id) : jsToVariant(0), end];
};

// type ranges =
//   | FullRange(filter(value))
//   | PartialRange(filter(value), sort, array(range))
const rangesToRe = (schema, store) => (ranges: Ranges) => {
  const { filter, sort, ranges: rangesArray } = ranges as any;
  const mappedFilter = filterToRe(filter, field =>
    filterValueToRe(getScalar(schema, store, field)),
  );
  if (!sort) return jsToVariant(0, mappedFilter);
  return jsToVariant(
    1,
    mappedFilter,
    sort.map(sortPartToRe),
    rangesArray.map(rangeToRe),
  );
};

const rangesMapToRe = (schema, rangesMap: Obj<Ranges[]>) =>
  objectToPairs(rangesMap, store =>
    rangesMap[store].map(ranges => rangesToRe(schema, store)(ranges)),
  );

// record = keyMap(recordValue)
const recordToRe = getFieldScalar => (record: Record) =>
  objectToPairs(record, field =>
    recordValueToRe(getFieldScalar(field))(record[field]),
  );
const recordToJs = record => buildObject(record, recordValueToJs) as Record;

// nullData = keyMap(keyMap(option(record)))
const nullDataToRe = (schema: Schema, nullData: NullData) =>
  objectToPairs(nullData, store =>
    objectToPairs(
      nullData[store],
      id =>
        nullData[store][id] &&
        recordToRe(
          field => (schema[store][field] as ScalarField).scalar || 'string',
        )(nullData[store][id]!),
    ),
  );
const nullDataToJs = nullData =>
  buildObject(nullData, records =>
    buildObject(records, record => record && recordToJs(record)),
  ) as NullData;

// formula = {
//   fields: array(string),
//   formula: array(recordValue) => recordValue,
// }
// schema = {
//   links: keyMap(keyMap(string)),
//   formulae: keyMap(keyMap(formula)),
// }
const schemaToRe = (schema: Schema) => [
  objectToPairs(schema, store =>
    objectToPairs(
      schema[store],
      field => (schema[store][field] as LinkField).store,
    ),
  ),
  objectToPairs(schema, store =>
    objectToPairs(
      schema[store],
      field => (schema[store][field] as ScalarField).formula,
    ),
  ),
];

export const toRe = {
  nullData: nullDataToRe,
  ranges: rangesMapToRe,
  schema: schemaToRe,
  search: searchToRe,
};
export const toJs = {
  change: changeValueToJs,
  nullData: nullDataToJs,
  search: searchToJs,
};
