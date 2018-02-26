import {
  Field,
  fieldIs,
  ForeignRelationField,
  Obj,
  ResolveQuery,
  Query,
  RelationField,
  Schema,
} from './typings';
import { undefOr } from './utils';

x => x as Field | Obj;

const standardizeQuery = (
  { filter, sort, fields, ...query }: ResolveQuery | Query,
  schema: Schema,
  field?: ForeignRelationField | RelationField,
) => {
  const mappedFields = (fields as (string | ResolveQuery | Query)[])
    .map(f => {
      if (typeof f === 'string') return f;
      return standardizeQuery(f, schema, schema[
        field ? field.type : query.name
      ][f.name] as ForeignRelationField | RelationField);
    })
    .filter(f => f) as (string | ResolveQuery)[];
  if (mappedFields.length === 0) return null;
  const result: ResolveQuery = {
    ...query,
    filter: undefOr(filter, Array.isArray(filter) ? filter : ['id', filter]),
    sort:
      sort && !Array.isArray(sort) ? [sort] : (sort as string[] | undefined),
    fields: mappedFields,
  };
  if (!field || fieldIs.foreignRelation(field)) {
    result.sort = result.sort || [];
  }
  if (result.sort) {
    if (!result.sort.some(s => s.replace('-', '') === 'id')) {
      result.sort = [...result.sort, 'id'];
    }
  }
  return result;
};
export const standardizeQueries = (
  queries: ResolveQuery[] | Query[],
  schema: Schema,
) =>
  (queries as (ResolveQuery | Query)[])
    .map(query => standardizeQuery(query, schema))
    .filter(f => f) as ResolveQuery[];
