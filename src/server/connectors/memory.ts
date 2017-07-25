import { Obj } from 'mishmash';

import { createCompare, runFilter } from '../../core';

import { Connector } from '../typings';

export default function memoryConnector(initialData: Obj[] = []): Connector {
  const records = initialData;

  return {
    async query({ filter = {}, sort = [], skip = 0, show = null }) {
      if (show === 0) return [];

      const filterFunc = (record: Obj) => runFilter(filter, record.id, record);
      const compareFunc = createCompare(
        (record: Obj, key) => record[key],
        sort,
      );

      return records
        .filter(filterFunc)
        .sort(compareFunc)
        .slice(skip, show === null ? undefined : skip + show);
    },

    async findById(id) {
      return records.find(record => record.id === id);
    },
    async findByIds(ids) {
      return records.filter(record => ids.includes(record.id));
    },

    async insert(id, data) {
      records.push({ id, ...data });
    },
    async update(id, data) {
      Object.assign(records.find(record => record.id === id), data);
    },
    async delete(id) {
      records.splice(records.findIndex(record => record.id === id), 1);
    },

    async dump() {
      return records;
    },
    async restore(data) {
      records.splice(0, records.length, data);
    },
  };
}
