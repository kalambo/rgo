import { Model } from 'sequelize';

import { Connector } from '../typings';

export default function sql(model: Model<any, any>): Connector {
  return {
    async query({ filter = {}, sort = [], skip = 0, show = null }) {
      if (show === 0) return [];

      return await model.findAll({
        where: filter,
        order: sort,
        offset: skip,
        limit: show === null ? undefined : 0,
      });
    },

    async findById(id) {
      return model.findById(id);
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
