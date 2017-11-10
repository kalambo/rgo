import {
  Field,
  fieldIs,
  ForeignRelationField,
  FullQuery,
  IdRecord,
  Obj,
  Query,
  RelationField,
  ScalarField,
} from './typings';
import { keysToObject } from './utils';

export const standardizeSchema = (schema: Obj<Obj<Field>>) => {
  return keysToObject<Obj<Field>>(Object.keys(schema), type => ({
    id: { scalar: 'string' },
    ...schema[type],
  }));
};

const standardizeQuery = (
  { filter, sort, fields, ...query }: FullQuery | Query,
  schema: Obj<Obj<Field>>,
  field?: ForeignRelationField | RelationField,
) => {
  const result: FullQuery = {
    ...query,
    filter:
      filter && !Array.isArray(filter)
        ? ['id', filter]
        : (filter as any[] | undefined),
    sort:
      sort && !Array.isArray(sort) ? [sort] : (sort as string[] | undefined),
    fields: (fields as (string | FullQuery | Query)[]).map(
      f =>
        typeof f === 'string'
          ? f
          : standardizeQuery(f, schema, schema[field ? field.type : query.name][
              f.name
            ] as ForeignRelationField | RelationField),
    ),
  };
  if (!field || fieldIs.foreignRelation(field)) {
    result.sort = result.sort || [];
  }
  if (result.sort) {
    if (!result.sort.some(s => s.replace('-', '') === 'id')) {
      result.sort.push('id');
    }
  }
  return result;
};
export const standardizeQueries = (
  queries: FullQuery[] | Query[],
  schema: Obj<Obj<Field>>,
) =>
  (queries as (FullQuery | Query)[]).map(query =>
    standardizeQuery(query, schema),
  );

export const standardizeUpdates = (
  updates: Obj<(IdRecord)[]>[],
  schema: Obj<Obj<Field>>,
) =>
  updates.map(records =>
    keysToObject(Object.keys(records), type =>
      records[type].map(
        record =>
          keysToObject(Object.keys(record), f => {
            const field = schema[type][f] as RelationField | ScalarField;
            if (field.isList && (record[f] as any[]).length === 0) return null;
            return record[f];
          }) as IdRecord,
      ),
    ),
  );
