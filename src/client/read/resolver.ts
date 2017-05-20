import sift from 'sift';
import orderBy from 'lodash/fp/orderby';
import { Obj } from 'mishmash';

import { Field, parseArgs } from '../../core';

interface ResolverContext {
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

  const rel = schema[root.__typename][field].relation;
  if (rel) {

    const filters: any[] = [{ id: { $in: toArray(root[field]) } }];
    if (rel.field) {
      filters.push({ [rel.field]: root.id });
    } else {
      const foreignField = Object.keys(schema[rel.type]).find(f =>
        !!schema[rel.type][f].relation &&
        schema[rel.type][f].relation!.type === root.__typename &&
        schema[rel.type][f].relation!.field === field
      );
      if (foreignField) {
        filters.push({ [foreignField]: root.id });
      }
    }

    const prev = root.__previous && root.__previous[field];
    const relData = getData(rel.type, args || {}, schema, data, user, prev, { $or: filters });

    return schema[root.__typename][field].isList ? relData : relData[0];
  }

  return root[field];

}

