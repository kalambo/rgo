import sift from 'sift';
import orderBy from 'lodash/fp/orderby';
import { Obj } from 'mishmash';

import { Field, fieldIs, parseArgs } from '../../core';

export interface ResolverContext {
  schema: Obj<Obj<Field>>;
  data: Obj<any[]>;
  user: string | null;
  previousResult: any;
}

const toArray = (x) => Array.isArray(x) ? x : [x];

const getData = (
  type: string, args: any, schema: Obj<Obj<Field>>, data: Obj<any[]>, user: string | null,
  previousResult?: any[], extraFilter?: any,
) => {

  const { filter, sort } = parseArgs(args, user || '', schema[type]);

  const sorted = orderBy(
    Object.keys(sort),
    Object.keys(sort).map(k => sort[k] === 1 ? 'asc' : 'desc'),
    sift({ ...filter, ...(extraFilter || {}) }, data[type]),
  );

  return sorted.map((x, i) => ({
    __typename: type,
    __previous: previousResult && toArray(previousResult)[i],
    ...x,
  }));

}

export default function resolver(
  field: string, root: any, args: any, { schema, data, user, previousResult }: ResolverContext,
) {

  if (!root) {
    return getData(field, args || {}, schema, data, user, previousResult && previousResult[field]);
  }

  const schemaField = schema[root.__typename][field];

  if (!fieldIs.scalar(schemaField)) {

    const filters: any[] = [{ id: { $in: toArray(root[field]) } }];

    if (fieldIs.relation(schemaField)) {
      const foreignField = Object.keys(schema[schemaField.relation.type]).find(f => {
        const foreignSchemaField = schema[schemaField.relation.type][f];
        return fieldIs.foreignRelation(foreignSchemaField) &&
          foreignSchemaField.relation.type === root.__typename &&
          foreignSchemaField.relation.field === field;
      });
      if (foreignField) filters.push({ [foreignField]: root.id });
    } else {
      filters.push({ [schemaField.relation.field]: root.id });
    }

    const prev = root.__previous && root.__previous[field];
    const result = getData(
      schemaField.relation.type, args || {}, schema, data, user, prev, { $or: filters },
    );

    return (fieldIs.foreignRelation(schemaField) || schemaField.isList) ? result : result[0];

  }

  return root[field];

}

