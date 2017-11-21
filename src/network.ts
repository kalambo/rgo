import keysToObject from 'keys-to-object';

import {
  Data,
  Field,
  fieldIs,
  ResolveQuery,
  Obj,
  ResolveRequest,
  ResolveResponse,
  Schema,
} from './typings';
import walker from './walker';
import { mapArray, mapData } from './utils';

const encodeDate = (v: Date | null) => v && v.getTime();
const decodeDate = (v: number | null) => v && new Date(v);

const codeFilter = (
  map: 'encode' | 'decode',
  fields: Obj<Field>,
  filter?: any[],
) => {
  if (!filter) return filter;
  if (['AND', 'OR'].includes(filter[0])) {
    return [filter[0], ...filter.slice(1).map(f => codeFilter(map, fields, f))];
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

const queryCoder = walker<
  ResolveQuery,
  { map: 'encode' | 'decode'; schema: Schema }
>(
  (
    { root, field, args, fields, extra, trace },
    relations,
    { map, schema },
  ) => ({
    name: root.field,
    alias: root.alias,
    ...args,
    filter: args.filter && codeFilter(map, schema[field.type], args.filter),
    fields: [...fields, ...relations.map(r => r.walk())],
    extra,
    trace,
  }),
);

const codeDate = <T>(map: 'encode' | 'decode', schema: Schema, data: Data<T>) =>
  mapData(
    data,
    (record, type) =>
      record &&
      keysToObject(Object.keys(record), f => {
        if (f === 'id') return record[f];
        const field = schema[type][f];
        if (fieldIs.scalar(field) && field.scalar === 'date') {
          return mapArray(
            record[f],
            map === 'encode' ? encodeDate : decodeDate,
          );
        }
        return record[f];
      }),
  );

export default {
  request(map: 'encode' | 'decode', schema: Schema, request: ResolveRequest) {
    return {
      commits:
        request.commits && request.commits.map(c => codeDate(map, schema, c)),
      queries:
        request.queries && queryCoder(request.queries, schema, { map, schema }),
      context: request.context,
    };
  },
  response(
    map: 'encode' | 'decode',
    schema: Schema,
    response: ResolveResponse,
  ) {
    return { ...response, data: codeDate(map, schema, response.data) };
  },
};
