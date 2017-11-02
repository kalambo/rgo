import * as _ from 'lodash';

import {
  Field,
  fieldIs,
  ForeignRelationField,
  FullArgs,
  Obj,
  Query,
  QueryLayer,
  RelationField,
} from './typings';

export const noUndef = (v: any, replacer: any = null) =>
  v === undefined ? replacer : v;

export const undefOr = (v: any, replacer: any = null) =>
  v === undefined ? undefined : replacer;

export const mapArray = (v: any, map: (x: any) => any) =>
  Array.isArray(v) ? v.map(map) : map(v);

export const keysToObject = <T, U = any>(
  keys: U[],
  valueMap: T | ((k: U, i: number) => T | undefined),
  keyMap?: (k: U, i: number) => string,
) => {
  const valueFunc = typeof valueMap === 'function';
  return keys.reduce<Obj<T>>((res, k, i) => {
    const newValue = valueFunc
      ? (valueMap as ((k: U, i: number) => T | undefined))(k, i)
      : valueMap as T;
    return newValue === undefined
      ? res
      : { ...res, [keyMap ? keyMap(k, i) : `${k}`]: newValue };
  }, {});
};

const binarySearch = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => 0 | 1 | -1,
  start = 0,
  end = array.length,
): number => {
  if (array.length === 0) return -1;

  const pivot = (start + end) >> 1;
  const c = compareFunc(element, array[pivot]);

  if (end - start <= 1) return c === 1 ? pivot : pivot - 1;
  if (c === 0) return pivot - 1;
  return c === 1
    ? binarySearch(element, array, compareFunc, pivot, end)
    : binarySearch(element, array, compareFunc, start, pivot);
};
export const locationOf = <T>(
  element: T,
  array: T[],
  compareFunc: (a: T, b: T) => 0 | 1 | -1,
) => binarySearch(element, array, compareFunc) + 1;

export const promisifyEmitter = <T>(
  emitter: (listener: (value: T | null) => void) => () => void,
  listener?: (value: T | null) => void,
) => {
  if (listener) return emitter(listener);
  return new Promise<T>(resolve => {
    const unlisten = emitter(value => {
      if (value !== null) {
        if (unlisten) unlisten();
        else setTimeout(() => unlisten());
        resolve(value);
      }
    });
  });
};

const compareValues = (a, b) => {
  if (_.isEqual(a, b)) return 0;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase().localeCompare(b.toLowerCase()) as 0 | 1 | -1;
  }
  if (a < b) return -1;
  return 1;
};
export const createCompare = <T>(
  get: (value: T, key: string) => any,
  sort: string[] = [],
) => (value1: T, value2: T): 0 | 1 | -1 => {
  for (const s of sort) {
    const key = s.replace('-', '');
    const dir = s[0] === '-' ? 'desc' : 'asc';
    const v1 = noUndef(get(value1, key));
    const v2 = noUndef(get(value2, key));
    if (v1 === null && v2 !== null) return 1;
    if (v1 !== null && v2 === null) return -1;
    const comp = compareValues(v1, v2);
    if (comp) return dir === 'asc' ? comp : -comp as 1 | -1;
  }
  return 0;
};

export const runFilter = (
  filter: any[] | undefined,
  id: string,
  record: any,
): boolean => {
  if (!record) return false;
  if (!filter) return true;

  if (['AND', 'OR'].includes(filter[0])) {
    if (filter[0] === 'AND') {
      return filter.slice(1).every(b => runFilter(b, id, record));
    } else if (filter[0] === 'OR') {
      return filter.slice(1).some(b => runFilter(b, id, record));
    }
  }

  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];

  const v = filter[0] === 'id' ? id : noUndef(record[filter[0]]);
  if (op === '=') return _.isEqual(v, value);
  if (op === '!=') return !_.isEqual(v, value);
  if (op === '<') return v < value;
  if (op === '<=') return v <= value;
  if (op === '>') return v > value;
  if (op === '>=') return v >= value;
  if (op === 'in') return value.includes(v);

  return false;
};

export const standardiseQuery = (
  { filter, sort, fields, ...query }: Query<string>,
  schema: Obj<Obj<Field>>,
  field?: ForeignRelationField | RelationField,
) => {
  const result: Query = {
    ...query,
    filter:
      filter && !Array.isArray(filter)
        ? ['id', filter]
        : filter as any[] | undefined,
    sort: sort && !Array.isArray(sort) ? [sort] : sort as string[] | undefined,
    fields: fields.map(
      f =>
        typeof f === 'string'
          ? f
          : standardiseQuery(f, schema, schema[field ? field.type : query.name][
              f.name
            ] as ForeignRelationField | RelationField),
    ),
  };
  if (!field || fieldIs.foreignRelation(field)) {
    result.sort = result.sort || [];
  }
  if (result.sort) {
    if (!result.sort.some(s => s.replace('-', '') === 'createdat')) {
      result.sort.push('-createdat');
    }
    if (!result.sort.some(s => s.replace('-', '') === 'id')) {
      result.sort.push('id');
    }
  }
  return result;
};

export const getFilterFields = (filter: any[]): string[] => {
  if (['AND', 'OR'].includes(filter[0])) {
    return filter
      .slice(1)
      .reduce((res, f) => [...res, ...getFilterFields(f)], []);
  }
  return [filter[0]];
};

export const encodeDate = (v: Date | null) => v && v.getTime();
export const decodeDate = (v: number | null) => v && new Date(v);
export const mapFilter = (
  map: 'encode' | 'decode',
  filter: string | any[],
  fields: Obj<Field>,
) => {
  if (typeof filter === 'string') return filter;
  if (['AND', 'OR'].includes(filter[0])) {
    return [filter[0], ...filter.slice(1).map(f => mapFilter(map, f, fields))];
  }
  const field = fields[filter[0]];
  const isDate = fieldIs.scalar(field) && field.scalar === 'date';
  if (!isDate) return filter;
  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];
  return [
    filter[0],
    op,
    mapArray(value, map === 'encode' ? encodeDate : decodeDate),
  ];
};

const printValue = (value: any, first = false) => {
  if (Array.isArray(value)) {
    return `[${value.map(v => printValue(v)).join(', ')}]`;
  } else if (typeof value === 'object') {
    const result = Object.keys(value)
      .filter(k => value[k] !== undefined)
      .map(k => `${k}: ${printValue(value[k])}`)
      .join(', ');
    return first ? (result ? `(${result})` : '') : `{ ${result} }`;
  } else if (typeof value === 'string') {
    return `"${value}"`;
  }
  return `${value}`;
};
export const printArgs = (args: FullArgs<string>, fields: Obj<Field>) => {
  return printValue(
    args.filter
      ? { ...args, filter: mapFilter('encode', args.filter, fields) }
      : args,
    true,
  );
};

const walkQueryLayer = <T, U>(
  layer: QueryLayer,
  relations: Query[],
  schema: Obj<Obj<Field>>,
  context: U,
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
): T =>
  func(layer, context, () =>
    relations.map(({ name, alias, fields, ...args }: Query) =>
      walkQueryLayer(
        {
          root: { type: layer.field.type, field: name, alias },
          field: schema[layer.field.type][name] as
            | ForeignRelationField
            | RelationField,
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          path: [...layer.path, alias || name],
        },
        fields.filter(f => typeof f !== 'string') as Query[],
        schema,
        context,
        func,
      ),
    ),
  );
export const queryWalker = <T, U>(
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
) => (
  { name, alias, fields, ...args }: Query,
  schema: Obj<Obj<Field>>,
  context: U,
) =>
  walkQueryLayer(
    {
      root: { field: name, alias },
      field: { type: name, isList: true },
      args,
      fields: fields.filter(f => typeof f === 'string') as string[],
      path: [alias || name],
    },
    fields.filter(f => typeof f !== 'string') as Query[],
    schema,
    context,
    func,
  );
