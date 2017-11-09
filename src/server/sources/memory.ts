import * as _ from 'lodash';

import { createCompare, IdRecord, Obj, runFilter, Source } from '../../core';
import { keysToObject } from '../../core/utils';

export default function memoryConnector(
  newId: () => string,
  initialData: IdRecord[] = [],
): Source {
  const records = initialData;
  return {
    newId,
    async query({ filter, sort, start = 0, end }, fields) {
      if (start === end) return [];
      const filterFunc = (record: Obj) => runFilter(filter, record.id, record);
      const compareFunc = createCompare(
        (record: Obj, key) => record[key],
        sort,
      );
      return _.cloneDeep(
        records
          .filter(filterFunc)
          .sort(compareFunc)
          .slice(start, end),
      ).map(record => keysToObject(fields, f => record[f]) as IdRecord);
    },
    async findById(id) {
      return _.cloneDeep(records.find(record => record.id === id) || null);
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
      records.splice(0, records.length, ...data);
    },
  };
}
