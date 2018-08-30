import keysToObject from 'keys-to-object';

import rgo from '../src/index';
import { idInFilter, sortIds } from '../src/data';
import { Filter, Slice, Sort } from '../src/typings';

import { server } from './server';

export const setup = () => {
  const schema = {
    links: {
      people: {
        address: 'addresses',
      },
    },
    formulae: {},
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
    find(
      store: string,
      filter: Filter,
      sort: Sort,
      slice: Slice,
      fields: string[],
    ) {
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
  };

  const createConnection = server(schema, db);

  return rgo(schema, createConnection());
};
