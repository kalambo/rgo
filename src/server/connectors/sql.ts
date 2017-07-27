import { Model } from 'sequelize';

import { Connector } from '../typings';

export default function sql(model: Model<any, any>): Connector {
  return {
    async query({
      filter = {},
      sort = [],
      skip = 0,
      show = null,
      fields = null,
      trace,
    }) {
      if (show === 0) return [];

      if (!trace) {
        return await model.findAll({
          where: filter,
          order: sort,
          offset: skip,
          limit: show === null ? undefined : show,
          attributes: fields || undefined,
        });
      }

      const results = Promise.all([
        skip === trace.skip
          ? []
          : await model.findAll({
              where: filter,
              order: sort,
              offset: skip,
              limit: trace.skip,
              attributes: fields || undefined,
            }),
        await model.findAll({
          where: filter,
          order: sort,
          offset: trace.skip,
          limit: trace.show === null ? undefined : trace.show,
          attributes: ['id'],
        }),
        trace.show === null || show === trace.show
          ? []
          : await model.findAll({
              where: filter,
              order: sort,
              offset: trace.show,
              limit: show === null ? undefined : show,
              attributes: fields || undefined,
            }),
      ]);

      return [...results[0], ...results[1], ...results[2]];
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
