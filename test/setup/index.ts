import loadRgo, { Rgo, run, update } from '../../src';
import { find, localPrefix } from '../../src/utils';

const allData = require('./data.json');
const schema = require('./schema.json');

export let rgo: Rgo;

export const setup = async () => {
  let counter = 0;
  const connector = {
    query(type, args, fields) {
      return find(allData[type], args, fields);
    },
    upsert(type, id, record) {
      if (!id) {
        const newId = `${counter++}`;
        const result = { id: newId, ...record };
        allData[type].push(result);
        return result;
      } else {
        const index = allData[type].findIndex(r => r.id === id);
        if (index !== -1) Object.assign(allData[type][index], record);
        return { id, ...record };
      }
    },
    delete(type, id) {
      const index = allData[type].findIndex(r => r.id === id);
      if (index !== -1) allData[type].splice(index, 1);
    },
  };
  rgo = loadRgo(schema, async request => {
    const data = {};
    const newIds = await update(request.updates, schema, connector, data);
    const firstIds = await run(request.queries, schema, connector, data);
    return { data, newIds, firstIds };
  });
};

export const clear = () => {
  rgo = null;
};
