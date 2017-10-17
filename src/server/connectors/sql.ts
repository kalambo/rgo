import * as knex from 'knex';

import { Field, fieldIs, keysToObject, Obj, ScalarName } from '../../core';

import { Connector } from '../typings';

const sqlScalars = {
  boolean: 'BOOLEAN',
  int: 'INTEGER',
  float: 'FLOAT',
  string: 'TEXT',
  date: 'TIMESTAMPTZ',
  file: 'TEXT',
  json: 'JSON',
};

interface DbField {
  scalar: ScalarName;
  isList?: boolean;
}

const toDbField = (field: Field): DbField | null => {
  if (fieldIs.foreignRelation(field)) return null;
  return {
    scalar: fieldIs.scalar(field) ? field.scalar : 'string',
    isList: field.isList,
  };
};

export function applyFilter(
  knex: knex.QueryBuilder,
  filter: any[],
  isOr?: boolean,
) {
  if (filter[0] === 'AND' || filter[0] === 'OR') {
    return knex.where(function(this: knex.QueryBuilder) {
      filter[1].forEach(f => applyFilter(this, f, filter[0] === 'OR'));
    });
  }
  if (filter[2] === null && ['=', '!='].includes(filter[1])) {
    return knex[
      `${isOr ? 'orWhere' : 'where'}${filter[1] === '=' ? 'Null' : 'NotNull'}`
    ](filter[0]);
  }
  return knex[isOr ? 'orWhere' : 'where'](filter[0], filter[1], filter[2]);
}

export default async function sql(
  knex: knex,
  type: string,
  newId: () => string,
  fieldTypes: Obj<Field>,
  owner?: string,
): Promise<Connector> {
  const dbFields = keysToObject(
    Object.keys(fieldTypes).filter(f => toDbField(fieldTypes[f])),
    f => toDbField(fieldTypes[f])!,
  );

  const columns = await knex(type).columnInfo();
  if (Object.keys(columns).length === 0) {
    await knex.schema.createTable(type, table => {
      table.text('id').primary();
      table.timestamp('createdat');
      table.timestamp('modifiedat');
    });
    if (owner) await knex.raw('ALTER TABLE ?? OWNER TO ??;', [type, owner]);
  }
  for (const field of Array.from(
    new Set([...Object.keys(columns), ...Object.keys(dbFields)]),
  )) {
    if (!columns[field] && dbFields[field]) {
      await knex.schema.table(type, table => {
        table.specificType(
          field,
          `${sqlScalars[dbFields[field].scalar]}${dbFields[field].isList
            ? '[]'
            : ''}`,
        );
      });
    } else if (columns[field] && !dbFields[field]) {
      // await knex.schema.table(type, table => {
      //   table.dropColumn(field);
      // });
    }
  }

  return {
    newId,
    async query({ filter, sort, start = 0, end, fields }) {
      if (start === end) return [];
      const query = filter ? applyFilter(knex(type), filter) : knex(type);
      if (sort) {
        sort.forEach(([field, dir]) => {
          if (dbFields[field].scalar === 'string' && !dbFields[field].isList) {
            query.orderByRaw(`lower("${field}") ${dir}`);
          } else {
            query.orderBy(field, dir);
          }
        });
      }
      query.offset(start);
      if (end !== undefined) query.limit(end);
      query.select(...(fields || []));
      return await query;
    },
    async findById(id) {
      return await knex(type)
        .where('id', id)
        .first();
    },
    async insert(id, data) {
      await knex(type).insert({ id, ...data });
    },
    async update(id, data) {
      await knex(type)
        .where('id', id)
        .update(data);
    },
    async delete(id) {
      await knex(type)
        .where('id', id)
        .delete();
    },
    async dump() {
      return await knex(type).select();
    },
    async restore(data) {
      await knex(type).truncate();
      await knex(type).insert(data);
    },
  };
}
