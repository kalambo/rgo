import * as knex from 'knex';

import {
  Field,
  fieldIs,
  keysToObject,
  Obj,
  RelationField,
  ScalarField,
  Source,
} from '../../core';

const sqlScalars = {
  boolean: 'BOOLEAN',
  int: 'INTEGER',
  float: 'FLOAT',
  string: 'TEXT',
  date: 'TIMESTAMPTZ',
  file: 'TEXT',
  json: 'JSON',
};

export function applyFilter(
  knex: knex.QueryBuilder,
  filter: any[],
  isOr?: boolean,
) {
  if (['AND', 'OR'].includes(filter[0])) {
    return knex.where(function(this: knex.QueryBuilder) {
      filter.slice(1).forEach(f => applyFilter(this, f, filter[0] === 'OR'));
    });
  }
  const op = filter.length === 3 ? filter[1] : '=';
  const value = filter[filter.length - 1];
  if (value === null && ['=', '!='].includes(op)) {
    return knex[
      `${isOr ? 'orWhere' : 'where'}${op === '=' ? 'Null' : 'NotNull'}`
    ](filter[0]);
  }
  return knex[isOr ? 'orWhere' : 'where'](filter[0], op, value);
}

export default async function sql(
  knex: knex,
  type: string,
  newId: () => string,
  fieldTypes: Obj<Field>,
  owner?: string,
): Promise<Source> {
  const dbFields: Obj<string> = {
    createdat: 'TIMESTAMPTZ',
    modifiedat: 'TIMESTAMPTZ',
    ...keysToObject(
      Object.keys(fieldTypes).filter(
        f => !fieldIs.foreignRelation(fieldTypes[f]),
      ),
      f => {
        const field = fieldTypes[f] as RelationField | ScalarField;
        return `${sqlScalars[fieldIs.scalar(field) ? field.scalar : 'string']}${
          field.isList ? '[]' : ''
        }`;
      },
    ),
  };

  const columns: Obj<knex.ColumnInfo> = (await knex(type).columnInfo()) as any;
  if (Object.keys(columns).length === 0) {
    await knex.schema.createTable(type, table => {
      table.text('id').primary();
    });
    if (owner) await knex.raw('ALTER TABLE ?? OWNER TO ??;', [type, owner]);
  }
  delete columns.id;
  for (const field of Array.from(
    new Set([...Object.keys(columns), ...Object.keys(dbFields)]),
  )) {
    if (!columns[field] && dbFields[field]) {
      await knex.schema.table(type, table => {
        table.specificType(field, dbFields[field]);
      });
    } else if (columns[field] && !dbFields[field]) {
      // await knex.schema.table(type, table => {
      //   table.dropColumn(field);
      // });
    }
  }

  return {
    newId,
    async query({ filter, sort, start = 0, end }, fields) {
      if (start === end) return [];
      const query = filter ? applyFilter(knex(type), filter) : knex(type);
      if (sort) {
        sort.forEach(s => {
          const field = s.replace('-', '');
          const dir = s[0] === '-' ? 'desc' : 'asc';
          if (dbFields[field] === 'TEXT') {
            query.orderByRaw(`lower("${field}") ${dir}`);
          } else {
            query.orderByRaw(`${field} ${dir} NULLS LAST`);
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
