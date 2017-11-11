import loadRgo, { enhancers, Rgo, resolvers } from '../src';
import { find, localPrefix } from '../src/utils';

export let rgo: Rgo;

const schema = {
  addresses: {
    street: { scalar: 'string' },
    city: { scalar: 'string' },
    zipcode: { scalar: 'string' },
    people: { type: 'people', foreign: 'places' },
  },
  people: {
    firstname: { scalar: 'string' },
    lastname: { scalar: 'string' },
    email: { scalar: 'string' },
    address: { type: 'addresses' },
    places: { type: 'addresses', isList: true },
  },
} as any;

export const setup = async () => {
  const allData = {
    addresses: [
      {
        id: 'A',
        street: '23106 Frederique Street',
        city: 'Lynchfurt',
        zipcode: '17381',
        people: ['D'],
      },
      {
        id: 'B',
        street: '39691 Crooks Centers',
        city: 'Tobyhaven',
        zipcode: '08963',
      },
      {
        id: 'C',
        street: '79464 Ottis Heights',
        city: 'Princeview',
        zipcode: '23194',
      },
      {
        id: 'D',
        street: '407 Jakubowski Vista',
        city: 'Jeannebury',
        zipcode: '56075',
      },
      {
        id: 'E',
        street: '99228 Witting Mountains',
        city: 'Rileyfurt',
        zipcode: '43912',
      },
    ],
    people: [
      {
        id: 'A',
        firstname: 'Esperanza',
        lastname: 'Boyle',
        email: 'Braeden_OKon88@yahoo.com',
        address: 'A',
        places: ['A', 'B', 'C'],
      },
      {
        id: 'B',
        firstname: 'Delphia',
        lastname: 'Cole',
        email: 'Althea.Trantow54@hotmail.com',
        address: 'B',
        places: ['B', 'C', null],
      },
      {
        id: 'C',
        firstname: 'Ena',
        lastname: 'Cartwright',
        email: 'Lacy_Marks69@yahoo.com',
        address: 'C',
        places: [null, 'C', 'D'],
      },
      {
        id: 'D',
        firstname: 'Griffin',
        lastname: 'Farrell',
        email: 'Keshawn78@hotmail.com',
        address: 'D',
        places: ['D'],
      },
      {
        id: 'E',
        firstname: null,
        lastname: 'Hansen',
        email: 'Misael12@gmail.com',
        address: null,
        places: null,
      },
    ],
  };

  let counter = 0;
  rgo = loadRgo(
    resolvers.simple(schema, {
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
    }),
  );
};

export const clear = () => {
  rgo = null;
};
