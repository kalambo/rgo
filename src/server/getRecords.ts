import { FieldNode, GraphQLResolveInfo } from 'graphql';

import {
  createCompare,
  fieldIs,
  ForeignRelationField,
  mapFilter,
  Obj,
  RelationField,
} from '../core';

import {
  Connector,
  FilterPlugin,
  Info,
  QueryLimit,
  QueryPlugin,
} from './typings';

export default async function getRecords(
  info: Info,
  connectors: Obj<Connector>,
  field: ForeignRelationField | RelationField,
  args: Obj,
  resolveInfo: GraphQLResolveInfo,
  filterPlugins: FilterPlugin[],
  queryPlugins: QueryPlugin[],
  extra?: { filter: any[]; fields: string[] },
) {
  if (args.filter && !Array.isArray(args.filter)) {
    args.filter = ['id', args.filter];
  }
  if (args.filter) {
    args.filter = mapFilter('decode', args.filter, info.schema[field.type]);
    args.filter = filterPlugins.reduce((res, p) => p(res, info), args.filter);
  }
  if (args.sort && !Array.isArray(args.sort)) {
    args.sort = [args.sort];
  }
  if (args.sort) {
    if (!args.sort.some(s => s.replace('-', '') === 'createdat')) {
      args.sort.push('-createdat');
    }
    if (!args.sort.some(s => s.replace('-', '') === 'id')) {
      args.sort.push('id');
    }
  }

  if (extra) {
    args.filter = args.filter
      ? ['AND', args.filter, extra.filter]
      : extra.filter;
  }
  args.fields = Array.from(
    new Set([
      'id',
      ...(resolveInfo.fieldNodes[0].selectionSet!.selections as FieldNode[])
        .map(f => f.name.value)
        .filter(
          fieldName =>
            !fieldIs.foreignRelation(info.schema[field.type][fieldName]),
        ),
      ...(args.sort || []).map(s => s.replace('-', '')),
      ...(extra ? extra.fields : []),
    ]),
  );

  const limits = (await Promise.all(
    queryPlugins.map(m => m(field.type, info)),
  )).reduce<QueryLimit[]>((res, l) => [...res, ...(l || [])], []);
  if (limits.length === 0) {
    return await connectors[field.type].query(args);
  }

  const limitsMap: Obj<any[][]> = {};
  limits.forEach(({ filter, fields }) => {
    const key = (fields || []).sort().join('-');
    limitsMap[key] = limitsMap[key] || [];
    if (filter) limitsMap[key].push(filter);
  });
  const groupedLimits = Object.keys(limitsMap).map(key => {
    const fields = key
      ? ['id', 'createdat', 'modifiedat', ...key.split('-')]
      : undefined;
    return {
      filter:
        args.filter && limitsMap[key].length > 0
          ? ['AND', args.filter, ['OR', ...limitsMap[key]]]
          : args.filter || limitsMap[key],
      fields:
        args.fields && fields
          ? args.fields.filter(f => fields.includes(f))
          : args.fields || fields,
    };
  });

  if (groupedLimits.length === 1) {
    return await connectors[field.type].query({
      ...args,
      ...groupedLimits[0],
    });
  }

  const data: Obj<Obj> = {};
  for (const records of await Promise.all(
    groupedLimits.map(connectors[field.type].query),
  )) {
    records.forEach(r => (data[r.id] = { ...(data[r.id] || {}), ...r }));
  }
  return Object.keys(data)
    .map(id => data[id])
    .sort(createCompare((record, key) => record[key], args.sort))
    .slice(args.start, args.end);
}
