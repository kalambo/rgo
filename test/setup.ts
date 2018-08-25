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
    people: {
      A: {
        firstName: 'First A',
        lastName: 'Last A',
        email: 'Email A',
        address: 'A',
      },
      B: {
        firstName: 'First B',
        lastName: 'Last B',
        email: 'Email B',
        address: 'B',
      },
    },
    addresses: {
      A: { city: 'City A', postcode: 'Postcode A' },
      B: { city: 'City B', postcode: 'Postcode B' },
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
