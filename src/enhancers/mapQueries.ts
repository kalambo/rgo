import { Enhancer, Field, ResolveQuery, Obj } from '../typings';
import walker from '../walker';

import base from './base';

export interface QueryMap {
  filter?: any[];
  fields: string[];
}

const queryMapper = walker<
  Promise<ResolveQuery[]>,
  {
    map: (
      query: {
        type: string;
        filter?: any[];
        fields: string[];
      },
      info: { schema: Obj<Obj<Field>>; context: Obj },
    ) => QueryMap | QueryMap[] | Promise<QueryMap | QueryMap[]>;
    info: { schema: Obj<Obj<Field>>; context: Obj };
  }
>(async ({ root, args, fields, extra, trace }, relations, { map, info }) => {
  const results = await map(
    {
      type: root.type || root.field,
      filter: args.filter,
      fields: Array.from(new Set([...fields, ...relations.map(r => r.name)])),
    },
    info,
  );
  const resultMap: Obj<any[][]> = {};
  (Array.isArray(results) ? results : [results]).forEach(r => {
    if (!r.fields.includes('id')) r.fields.push('id');
    const key = r.fields.sort().join('-');
    resultMap[key] = resultMap[key] || [];
    if (r.filter) resultMap[key].push(r.filter);
  });
  const groupedResults = Object.keys(resultMap).map(key => ({
    filter:
      resultMap[key].length > 0
        ? resultMap[key].length === 1
          ? resultMap[key][0]
          : ['OR', ...resultMap[key]]
        : undefined,
    fields: key.split('-'),
  }));
  const resultFields = Array.from(
    new Set(
      groupedResults.reduce((res, r) => [...res, ...r.fields], [] as string[]),
    ),
  );
  const base = {
    name: root.field,
    alias: root.alias,
    ...args,
    extra,
    trace,
  };
  const resultRelations = relations.filter(r => resultFields.includes(r.name));
  const mappedRelations = await Promise.all(resultRelations.map(r => r.walk()));
  const relationQueries: Obj<ResolveQuery[]> = {};
  resultRelations.forEach((r, i) => {
    relationQueries[r.name] = [
      ...relationQueries[r.name],
      ...mappedRelations[i],
    ];
  });
  return groupedResults.map(r => ({
    ...base,
    filter: r.filter,
    fields: r.fields.reduce(
      (res, f) => [
        ...res,
        ...(fields.includes(f) ? [f] : []),
        ...(relationQueries[f] || []),
      ],
      [] as (string | ResolveQuery)[],
    ),
  }));
});

export default function mapQueries(
  map: (
    query: {
      type: string;
      filter?: any[];
      fields: string[];
    },
    info: { schema: Obj<Obj<Field>>; context: Obj },
  ) => QueryMap | QueryMap[] | Promise<QueryMap | QueryMap[]>,
) {
  return base(async (resolver, request, schema) => {
    request.context = request.context || {};
    return await resolver({
      ...request,
      queries: (await Promise.all(
        queryMapper(request.queries || [], schema, {
          map,
          info: { schema, context: request.context },
        }),
      )).reduce((res, q) => [...res, ...q], []),
    });
  }) as Enhancer;
}
