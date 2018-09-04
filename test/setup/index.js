const rgo = require('../../lib/js/src/index').default;

const { idInFilter, sortIds } = require('./data');
const server = require('./server');
const { keysToObject } = require('./utils');

module.exports = () => {
  const schema = {
    people: {
      firstName: { scalar: 'string' },
      lastName: { scalar: 'string' },
      age: { scalar: 'int' },
      address: { store: 'addresses' },
      places: { store: 'addresses', isList: true },
    },
    addresses: {
      city: { scalar: 'string' },
    },
  };

  const data = {
    addresses: {
      A: {
        city: 'Lynchfurt',
      },
      B: {
        city: 'Tobyhaven',
      },
      C: {
        city: 'Princeview',
      },
      D: {
        city: 'Jeannebury',
      },
      E: {
        city: 'Rileyfurt',
      },
    },
    people: {
      A: {
        firstName: 'Esperanza',
        lastName: 'Boyle',
        age: 20,
        address: 'A',
        places: ['A', 'B', 'C'],
      },
      B: {
        firstName: 'Delphia',
        lastName: 'Cole',
        age: 20,
        address: 'B',
        places: ['B', 'C', null],
      },
      C: {
        firstName: 'Ena',
        lastName: 'Cartwright',
        age: 40,
        address: 'C',
        places: [null, 'C', 'D'],
      },
      D: {
        firstName: 'Griffin',
        lastName: 'Farrell',
        age: 30,
        address: 'D',
        places: ['D'],
      },
      E: {
        firstName: null,
        lastName: 'Hansen',
        age: 20,
        address: null,
        places: null,
      },
    },
  };

  const db = {
    find(store, filter, sort, slice, fields) {
      const ids = sortIds(
        schema,
        data,
        store,
        Object.keys(data[store]).filter(id =>
          idInFilter(schema, data, store, id, filter),
        ),
        sort,
      ).slice(slice.start, slice.end);
      return ids.map(id => ({
        id,
        ...keysToObject(
          fields,
          f => (data[store][id][f] === undefined ? null : data[store][id][f]),
        ),
      }));
    },
    get(store, id) {
      return data[store][id];
    },
    update(store, id, data) {
      data[store][id] = { ...data[store][id], ...data };
    },
    delete(store, id) {
      delete data[store][id];
    },
  };

  const createConnection = server(schema, db);

  return rgo(schema, createConnection());
};
