import * as Sequelize from 'sequelize';

import {
  Field,
  fieldIs,
  keysToObject,
  Obj,
  RelationField,
  ScalarField,
  undefOr,
} from '../../core';

import { Connector } from '../typings';

const sqlScalars = {
  Boolean: Sequelize.BOOLEAN,
  Int: Sequelize.INTEGER,
  Float: Sequelize.FLOAT,
  String: Sequelize.STRING,
  Date: Sequelize.DATE,
  File: Sequelize.STRING,
  JSON: Sequelize.JSON,
};

export default function sql(
  sequelize: Sequelize.Sequelize,
  tableName: string,
): (fields: Obj<Field>) => Connector {
  return fields => {
    const model = sequelize.define(
      tableName,
      {
        ...keysToObject(
          Object.keys(fields).filter(f => !fieldIs.foreignRelation(fields[f])),
          f => {
            const field = fields[f] as RelationField | ScalarField;
            const fieldType = fieldIs.scalar(field)
              ? sqlScalars[field.scalar]
              : Sequelize.STRING;
            if (field.isList) return { type: Sequelize.ARRAY(fieldType) };
            return { type: fieldType };
          },
        ),
        id: { type: Sequelize.STRING, primaryKey: true },
      },
      { timestamps: false, freezeTableName: true },
    );

    return {
      async query({ filter = {}, sort = [], start = 0, end, fields }) {
        if (start === end) return [];

        return await model.findAll({
          where: filter,
          order: sort,
          offset: start,
          limit: undefOr(end, end! - start),
          attributes: fields,
        });
      },

      async findById(id) {
        return model.findById(id);
      },
      async findByIds(ids) {
        return model.findAll({ where: { id: { $in: ids } } });
      },

      async insert(id, data) {
        model.create({ id, ...data });
      },
      async update(id, data) {
        model.update(data, { where: { id } });
      },
      async delete(id) {
        model.destroy({ where: { id } });
      },

      async dump() {
        return await model.findAll();
      },
      async restore(data) {
        await model.destroy();
        model.bulkCreate(data);
      },
    };
  };
}
