import { Obj } from 'mishmash';

import { compareValues, runFilter } from '../../core';

import { Connector } from '../typings';

export default function memoryConnector(initialData: Obj[] = []): Connector {
  const records = initialData;

  return {
    async query({ filter = {}, sort = [], skip = 0, show = null }) {
      if (show === 0) return [];

      const filterFunc = (record: Obj) => runFilter(filter, record.id, record);
      const compareFunc = (record1: Obj, record2: Obj): 0 | 1 | -1 => {
        for (const [key, order] of sort) {
          const comp =
            key === 'id'
              ? compareValues(record1.id, record2.id)
              : compareValues(record1[key], record2[key]);
          if (comp) return order === 'asc' ? comp : -comp as 1 | -1;
        }
        return 0;
      };

      return records
        .filter(filterFunc)
        .sort(compareFunc)
        .slice(skip, show === null ? undefined : skip + show);
    },

    async findById(id) {
      return records.find(record => record.id === id);
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
