import * as knex from 'knex';

import { Obj } from '../../core';

import { Connector, DbField } from '../typings';

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

export default {
  type(
    knex: () => knex.QueryBuilder,
    newId: () => string,
    fieldsTypes: Obj<DbField>,
  ): Connector {
    return {
      newId,

      async query({ filter, sort, start = 0, end, fields }) {
        if (start === end) return [];
        const query = filter ? applyFilter(knex(), filter) : knex();
        if (sort) {
          sort.forEach(([field, dir]) => {
            if (
              fieldsTypes[field].scalar === 'string' &&
              !fieldsTypes[field].isList
            ) {
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
        return await knex()
          .where('id', id)
          .first();
      },

      async insert(id, data) {
        await knex().insert({ id, ...data });
      },
      async update(id, data) {
        await knex()
          .where('id', id)
          .update(data);
      },
      async delete(id) {
        await knex()
          .where('id', id)
          .delete();
      },

      async dump() {
        return await knex().select();
      },
      async restore(data) {
        await knex().truncate();
        await knex().insert(data);
      },
    };
  },

  alter(knex: knex, owner?: string) {
    return async (type, field, info) => {
      if (field === undefined) {
        await knex.schema.createTable(type, table => {
          table.text('id').primary();
          table.timestamp('createdat');
          table.timestamp('modifiedat');
        });
        if (owner) {
          await knex.raw('ALTER TABLE ?? OWNER TO ??;', [type, owner]);
        }
      } else if (field === null) {
        await knex.schema.dropTable(type);
      } else if (info) {
        await knex.schema.table(type, table => {
          table.specificType(
            field,
            `${sqlScalars[info.scalar]}${info.isList ? '[]' : ''}`,
          );
        });
      } else {
        await knex.schema.table(type, table => {
          table.dropColumn(field);
        });
      }
    };
  },
};
