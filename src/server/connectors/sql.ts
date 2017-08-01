import { Model } from 'sequelize';

import { undefOr } from '../../core';

import { Connector } from '../typings';

export default function sql(model: Model<any, any>): Connector {
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
}
