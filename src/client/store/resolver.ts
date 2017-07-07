import * as orderBy from 'lodash/fp/orderBy';
import { Obj } from 'mishmash';

import { Field, fieldIs, parseArgs } from '../../core';

const toArray = x => (Array.isArray(x) ? x : [x]);

const runFilter = (block: any, obj: any) => {
  const key = Object.keys(block)[0];

  if (key === '$and')
    return (block[key] as any[]).every(b => runFilter(b, obj));
  if (key === '$or') return (block[key] as any[]).some(b => runFilter(b, obj));

  const op = Object.keys(block[key])[0];

  if (op === '$eq') return obj[key] === block[key][op];
  if (op === '$ne') return obj[key] !== block[key][op];
  if (op === '$lt') return obj[key] < block[key][op];
  if (op === '$lte') return obj[key] <= block[key][op];
  if (op === '$gt') return obj[key] > block[key][op];
  if (op === '$gte') return obj[key] >= block[key][op];
  if (op === '$in') return block[key][op].includes(obj[key]);

  return false;
};

const getData = (
  type: string,
  args: any,
  schema: Obj<Obj<Field>>,
  data: Obj<Obj<Obj<any>>>,
  user: string | null,
  extraFilter?: any,
) => {
  const { filter, sort } = parseArgs(args, user || '', schema[type]);

  const fullFilter = { ...filter, ...extraFilter || {} };
  const sorted = orderBy(
    Object.keys(sort),
    Object.keys(sort).map(k => (sort[k] === 1 ? 'asc' : 'desc')),
    Object.keys(data[type])
      .map(id => data[type][id])
      .filter(x => runFilter(fullFilter, x)),
  );

  return sorted.map(x => ({ __typename: type, ...x }));
};

export default function resolver(
  field: string,
  root: any,
  args: any,
  {
    schema,
    user,
    data,
  }: {
    schema: Obj<Obj<Field>>;
    data: Obj<Obj<Obj<any>>>;
    user: string | null;
  },
) {
  if (!root) {
    return getData(field, args || {}, schema, data, user);
  }

  const schemaField = schema[root.__typename][field];

  if (!fieldIs.scalar(schemaField)) {
    const filters: any[] = [{ id: { $in: toArray(root[field]) } }];

    if (fieldIs.relation(schemaField)) {
      const foreignField = Object.keys(
        schema[schemaField.relation.type],
      ).find(f => {
        const foreignSchemaField = schema[schemaField.relation.type][f];
        return (
          fieldIs.foreignRelation(foreignSchemaField) &&
          foreignSchemaField.relation.type === root.__typename &&
          foreignSchemaField.relation.field === field
        );
      });
      if (foreignField) filters.push({ [foreignField]: { $eq: root.id } });
    } else {
      filters.push({ [schemaField.relation.field]: { $eq: root.id } });
    }

    const result = getData(
      schemaField.relation.type,
      args || {},
      schema,
      data,
      user,
      { $or: filters },
    );

    return fieldIs.foreignRelation(schemaField) || schemaField.isList
      ? result
      : result[0];
  }

  return root[field];
}
