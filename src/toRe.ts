import keysToObject from 'keys-to-object';

import {
  Field,
  Filter,
  FilterUnit,
  LinkField,
  NullData,
  Obj,
  Ranges,
  Record,
  Scalar,
  ScalarField,
  Schema,
  Search,
  Value,
} from './typings';

export const isObject = x =>
  Object.prototype.toString.call(x) === '[object Object]';

export const objectToPairs = (obj, map) => {
  const result = Object.keys(obj)
    .map(key => {
      const value = map(key);
      return value && [key, value];
    })
    .filter(x => x);
  return result.length === 0 ? undefined : result;
};

export const jsToVariant = (tag, ...args) => {
  if (args.length === 0) return tag;
  (args as any).tag = tag;
  return args;
};

const getScalar = (schema: Schema, store: string, [field, ...path]: string[]) =>
  (path.reduce((res, field) => schema[(res as LinkField).store][field], schema[
    store
  ][field] as Field) as ScalarField).scalar;

// nonNullValue =
//   | Bool(bool)
//   | Int(int)
//   | Float(float)
//   | String(string)
//   | Date(Js.Date.t);
const nonNullValueToRe = (scalar: Scalar, value: Value) => {
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

// value =
//   | Null
//   | Value(nonNullValue);
const valueToRe = (scalar: Scalar, value: Value) =>
  value === null
    ? jsToVariant(0)
    : jsToVariant(0, nonNullValueToRe(scalar, value));

// recordValue =
//   | SingleValue(value)
//   | ArrayValue(array(value));
const recordValueToRe = (scalar: Scalar, value: Value | Value[]) =>
  Array.isArray(value)
    ? jsToVariant(1, value.map(v => valueToRe(scalar, v)))
    : jsToVariant(0, valueToRe(scalar, value));

// userFilterValue =
//   | FilterValue(value)
//   | FilterVariable(string);
const filterValueToRe = (scalar: Scalar, value: Value) =>
  isObject(value)
    ? jsToVariant(1, (value as any).field)
    : jsToVariant(0, valueToRe(scalar, value));

// userFilter =
//   | FilterOr(array(userFilter))
//   | FilterAnd(array(userFilter))
//   | FilterIn(fieldPath, array(value))
//   | FilterNeq(fieldPath, userFilterValue)
//   | FilterLte(fieldPath, userFilterValue)
//   | FilterGte(fieldPath, userFilterValue)
//   | FilterEq(fieldPath, userFilterValue)
//   | FilterLt(fieldPath, userFilterValue)
//   | FilterGt(fieldPath, userFilterValue);
const operations = ['in', '!=', '<=', '>=', '=', '<', '>'];
const filterToRe = (schema: Schema, store: string, filter: Filter) => {
  if (filter[0] === 'OR' || filter[0] === 'AND') {
    const [type, ...filters] = filter;
    return jsToVariant(
      type === 'OR' ? 0 : 1,
      filters.map(f => filterToRe(schema, store, f as Filter)),
    );
  }
  const [field, operation, value] = filter as FilterUnit;
  const fieldPath = field.split('.');
  const scalar = getScalar(schema, store, fieldPath);
  return jsToVariant(
    2 + operations.indexOf(operation),
    fieldPath,
    operation === 'in'
      ? (value as Value[]).map(v => filterValueToRe(scalar, v))
      : filterValueToRe(scalar, value as Value),
  );
};

// sortPart =
//   | Asc(fieldPath)
//   | Desc(fieldPath);
const sortPartToRe = (sort: string) =>
  sort[0] === '-'
    ? jsToVariant(1, sort.slice(1).split('.'))
    : jsToVariant(0, sort.split('.'));

// userField =
//   | UserField(fieldPath)
//   | UserSearch(userSearch);
const fieldToRe = (schema: Schema, field: string | Search) =>
  typeof field === 'string'
    ? jsToVariant(0, field.split('.'))
    : jsToVariant(1, searchToRe(schema, field));

// userSearch = {
//   name: string,
//   store: string,
//   filter: option(userFilter),
//   sort: option(sort),
//   slice: option(slice),
//   fields: array(userField),
// }
const searchToRe = (
  schema: Schema,
  { name, store, filter, sort, slice, fields }: Search,
) => [
  name,
  store,
  filter && filterToRe(schema, store, filter),
  sort && (Array.isArray(sort) ? sort.map(sortPartToRe) : [sortPartToRe(sort)]),
  slice && [slice.start, slice.end],
  fields.map(field => fieldToRe(schema, field)),
];

// record = keyMap(recordValue)
const recordToRe = (scalars: Obj<Scalar>, record: Record) =>
  objectToPairs(record, field =>
    recordValueToRe(scalars[field], record[field]),
  );

// nullData = keyMap(keyMap(option(record)))
const nullDataToRe = (schema: Schema, nullData: NullData) =>
  objectToPairs(nullData, store =>
    objectToPairs(
      nullData[store],
      id =>
        nullData[store][id] &&
        recordToRe(
          keysToObject(
            Object.keys(schema[store]),
            field => (schema[store][field] as ScalarField).scalar || 'string',
          ),
          nullData[store][id]!,
        ),
    ),
  );

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

// filterValue = {
//   value: option(value),
//   fields: array(string),
// };
const requestFilterValueToRe = (scalar, { value, fields }) => [
  value && valueToRe(scalar, value),
  fields,
];

// filterRange =
//   | FilterPoint(filterValue)
//   | FilterRange(filterValue, filterValue);
const requestFilterRangeToRe = (scalar, filterRange) =>
  jsToVariant(
    filterRange.length === 1 ? 0 : 1,
    ...filterRange.map(filterValue =>
      requestFilterValueToRe(scalar, filterValue),
    ),
  );

// filterMap = array((fieldPath, filterRange));
const requestFilterMapToRe = (schema, store, { field, range }) => [
  field,
  requestFilterRangeToRe(getScalar(schema, store, field), range),
];

// filter = array(filterMap);
const requestFilterToRe = (schema, store, filter) =>
  filter.map(filterMap =>
    filterMap.map(f => requestFilterMapToRe(schema, store, f)),
  );

// rangeStart =
//   | RangeFirst
//   | RangeIndex(int, string)
// range = (rangeStart, option(int))
const rangeToRe = ({ id, start, end }) => [
  id ? jsToVariant(1, start, id) : jsToVariant(0),
  end,
];

// ranges =
//   | FullRange(filter)
//   | PartialRange(filter, sort, array(range));
const rangesToRe = (schema, store, { filter, sort, ranges }) =>
  sort
    ? jsToVariant(
        1,
        requestFilterToRe(schema, store, filter),
        sort.map(sortPartToRe),
        ranges.map(rangeToRe),
      )
    : jsToVariant(0, requestFilterToRe(schema, store, filter));

const rangesMapToRe = (schema, rangesMap: Obj<Ranges[]>) =>
  objectToPairs(rangesMap, store =>
    rangesMap[store].map(ranges => rangesToRe(schema, store, ranges as any)),
  );

export const nullData = nullDataToRe;
export const ranges = rangesMapToRe;
export const schema = schemaToRe;
export const search = searchToRe;
