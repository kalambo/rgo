import keysToObject from 'keys-to-object';

import {
  Field,
  fieldIs,
  FullQuery,
  Obj,
  Record,
  ResolveRequest,
  ResolveResponse,
} from './typings';
import walker from './walker';
import { mapArray } from './utils';

const encodeDate = (v: Date | null) => v && v.getTime();
const decodeDate = (v: number | null) => v && new Date(v);

const mapFilter = (
  map: 'encode' | 'decode',
  fields: Obj<Field>,
  filter?: any[],
) => {
  if (!filter) return filter;
  if (typeof filter === 'string') return filter;
  if (['AND', 'OR'].includes(filter[0])) {
    return [filter[0], ...filter.slice(1).map(f => mapFilter(map, fields, f))];
  }
  if (filter[0] === 'id') return filter;
  const field = fields[filter[0]];
  if (fieldIs.scalar(field) && field.scalar === 'date') {
    const op = filter.length === 3 ? filter[1] : '=';
    const value = filter[filter.length - 1];
    return [
      filter[0],
      op,
      mapArray(value, map === 'encode' ? encodeDate : decodeDate),
    ];
  }
  return filter;
};

const queryMapper = walker<
  FullQuery,
  { map: 'encode' | 'decode'; schema: Obj<Obj<Field>> }
>(
  (
    { root, field, args, fields, offset, trace },
    { map, schema },
    walkRelations,
  ) => ({
    name: root.field,
    alias: root.alias,
    ...args,
    filter: args.filter && mapFilter(map, schema[field.type], args.filter),
    fields: [...fields, ...walkRelations()],
    offset,
    trace,
  }),
);

const mapData = (
  map: 'encode' | 'decode',
  schema: Obj<Obj<Field>>,
  data: Obj<Obj<Record | null>>,
) =>
  keysToObject(Object.keys(data), type =>
    keysToObject(
      Object.keys(data[type]),
      id =>
        data[type][id] &&
        keysToObject(Object.keys(data[type][id]!), f => {
          if (f === 'id') return data[type][id]![f];
          const field = schema[type][f];
          if (fieldIs.scalar(field) && field.scalar === 'date') {
            return mapArray(
              data[type][id]![f],
              map === 'encode' ? encodeDate : decodeDate,
            );
          }
          return data[type][id]![f];
        }),
    ),
  );

export default {
  request(
    map: 'encode' | 'decode',
    schema: Obj<Obj<Field>>,
    request: ResolveRequest,
  ) {
    return {
      commits: request.commits.map(c => mapData(map, schema, c)),
      queries: queryMapper(request.queries, schema, { map, schema }),
    };
  },
  response(
    map: 'encode' | 'decode',
    schema: Obj<Obj<Field>>,
    response: ResolveResponse,
  ) {
    return { ...response, data: mapData(map, schema, response.data) };
  },
};
