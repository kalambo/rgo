import { Enhancer, Falsy, ResolveQuery, Obj, Schema } from '../typings';
import walker from '../walker';
import { runFilterValue } from '../utils';

import base from './base';

export interface QueryLimit {
  filter?: any[];
  fields?: string[];
}

const reduceFilter = (filter: any[], fields: string[]): any[] | false => {
  if (['AND', 'OR'].includes(filter[0])) {
    const nested = filter.slice(1).map(f => reduceFilter(f, fields));
    if (filter[0] === 'AND' && nested.some(f => !f)) return false;
    return [filter[0], ...nested.filter(f => f)];
  }
  if (
    fields.includes(filter[0]) ||
    runFilterValue(
      null,
      filter.length === 3 ? filter[1] : '=',
      filter[filter.length - 1],
    )
  ) {
    return filter;
  }
  return false;
};

const getQueries = walker<
  Promise<ResolveQuery[]>,
  {
    map: (
      type: string,
      info: { schema: Schema; context: Obj },
    ) =>
      | QueryLimit
      | QueryLimit[]
      | Falsy
      | Promise<QueryLimit | QueryLimit[] | Falsy>;
    info: { schema: Schema; context: Obj };
  }
>(
  async (
    { root, field, args, fields, extra, trace, key },
    relations,
    { map, info },
  ) => {
    const limits = (await map(field.type, info)) || [{}];
    const limitMap: Obj<any[][]> = {};
    (Array.isArray(limits) ? limits : [limits]).forEach(l => {
      if (l.fields && !l.fields.includes('id')) l.fields.push('id');
      const key = (l.fields || []).sort().join('-');
      limitMap[key] = limitMap[key] || [];
      if (l.filter) limitMap[key].push(l.filter);
    });
    const allFields = Array.from(
      new Set([...fields, ...relations.map(r => r.name)]),
    );
    const queries = Object.keys(limitMap)
      .map(key => {
        const limitFields = key ? key.split('-') : null;
        const result = {
          filter:
            limitMap[key].length > 0
              ? limitMap[key].length === 1
                ? limitMap[key][0]
                : ['OR', ...limitMap[key]]
              : undefined,
          fields: limitFields
            ? limitFields.filter(f => allFields.includes(f))
            : allFields,
        };
        if (args.filter) {
          result.filter = result.filter
            ? ['AND', args.filter, result.filter]
            : args.filter;
        }
        if (result.filter && limitFields) {
          result.filter = reduceFilter(result.filter, limitFields) || undefined;
          if (!result.filter) return null;
        }
        return result;
      })
      .filter(q => q) as { filter?: any[]; fields: string[] }[];
    const allLimitFields = Array.from(
      new Set(
        queries.reduce((res, r) => [...res, ...r.fields], [] as string[]),
      ),
    );
    const relationQueries: Obj<ResolveQuery[]> = {};
    await Promise.all(
      relations.filter(r => allLimitFields.includes(r.name)).map(async r => {
        relationQueries[r.name] = [
          ...(relationQueries[r.name] || []),
          ...(await r.walk()),
        ];
      }),
    );
    return queries.map(q => ({
      name: root.field,
      alias: root.alias,
      ...args,
      filter: q.filter,
      fields: q.fields.reduce(
        (res, f) => [
          ...res,
          ...(fields.includes(f) ? [f] : []),
          ...(relationQueries[f] || []),
        ],
        [] as (string | ResolveQuery)[],
      ),
      extra,
      trace,
      key,
    }));
  },
);

export default function limitQueries(
  map: (
    type: string,
    info: { schema: Schema; context: Obj },
  ) =>
    | QueryLimit
    | QueryLimit[]
    | Falsy
    | Promise<QueryLimit | QueryLimit[] | Falsy>,
) {
  return base(async (resolver, request, schema) => {
    request.context = request.context || {};
    return await resolver({
      ...request,
      queries: (await Promise.all(
        getQueries(request.queries || [], schema, {
          map,
          info: { schema, context: request.context },
        }),
      )).reduce((res, q) => [...res, ...q], []),
    });
  }) as Enhancer;
}
