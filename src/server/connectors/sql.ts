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

const ops = { $ne: '!=', $lte: '<=', $gte: '>=', $eq: '=', $lt: '<', $gt: '>' };
export function applyFilter(
  knex: knex.QueryBuilder,
  filter: any,
  isOr?: boolean,
) {
  const key = Object.keys(filter)[0];
  if (key === '$and' || key === '$or') {
    return knex.where(function(this: knex.QueryBuilder) {
      filter[key].forEach(f => applyFilter(this, f, key === '$or'));
    });
  }
  const op = Object.keys(filter[key])[0];
  return knex[isOr ? 'orWhere' : 'where'](key, ops[op], filter[key][op]);
}

export default {
  type(
    knex: knex.QueryBuilder,
    newId: () => string,
    fieldsTypes: Obj<DbField>,
  ): Connector {
    return {
      newId,

      async query({ filter = {}, sort = [], start = 0, end, fields }) {
        if (start === end) return [];
        const query = applyFilter(knex, filter);
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
        query.offset(start);
        if (end !== undefined) query.limit(end);
        query.select(...(fields || []));
        return await query;
      },

      async findById(id) {
        return await knex.where('id', id).first();
      },
      async findByIds(ids) {
        return await knex.whereIn('id', ids).select();
      },

      async insert(id, data) {
        await knex.insert({ id, ...data });
      },
      async update(id, data) {
        await knex.where('id', id).update(data);
      },
      async delete(id) {
        await knex.where('id', id).delete();
      },

      async dump() {
        return await knex.select();
      },
      async restore(data) {
        await knex.truncate();
        await knex.insert(data);
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
