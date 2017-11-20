import loadRgo, { Rgo, Resolver, resolvers } from '../src';
import network from '../src/network';
import { find } from '../src/utils';

export let resolver: Resolver;
export let rgo: Rgo;

const schema = {
  addresses: {
    modifiedat: { scalar: 'date' },
    city: { scalar: 'string' },
    people: { type: 'people', foreign: 'places' },
  },
  people: {
    modifiedat: { scalar: 'date' },
    firstname: { scalar: 'string' },
    lastname: { scalar: 'string' },
    age: { scalar: 'int' },
    address: { type: 'addresses' },
    places: { type: 'addresses', isList: true },
  },
} as any;

export const setup = async () => {
  const allData = {
    addresses: [
      {
        id: 'A',
        city: 'Lynchfurt',
      },
      {
        id: 'B',
        city: 'Tobyhaven',
      },
      {
        id: 'C',
        city: 'Princeview',
      },
      {
        id: 'D',
        city: 'Jeannebury',
      },
      {
        id: 'E',
        city: 'Rileyfurt',
      },
    ],
    people: [
      {
        id: 'A',
        firstname: 'Esperanza',
        lastname: 'Boyle',
        age: 20,
        address: 'A',
        places: ['A', 'B', 'C'],
      },
      {
        id: 'B',
        firstname: 'Delphia',
        lastname: 'Cole',
        age: 20,
        address: 'B',
        places: ['B', 'C', null],
      },
      {
        id: 'C',
        firstname: 'Ena',
        lastname: 'Cartwright',
        age: 40,
        address: 'C',
        places: [null, 'C', 'D'],
      },
      {
        id: 'D',
        firstname: 'Griffin',
        lastname: 'Farrell',
        age: 30,
        address: 'D',
        places: ['D'],
      },
      {
        id: 'E',
        firstname: null,
        lastname: 'Hansen',
        age: 20,
        address: null,
        places: null,
      },
    ],
  };

  let counter = 0;
  resolver = resolvers.db(schema, {
    find(type, args, fields) {
      return find(allData[type], args, fields) as any[];
    },
    insert(type, record) {
      const newId = `${counter++}`;
      allData[type].push({ id: newId, ...record });
      return newId;
    },
    update(type, id, record) {
      const index = allData[type].findIndex(r => r.id === id);
      if (index !== -1) Object.assign(allData[type][index], record);
    },
    delete(type, id) {
      const index = allData[type].findIndex(r => r.id === id);
      if (index !== -1) allData[type].splice(index, 1);
    },
  });
  rgo = loadRgo(resolver);
};
