import { parse, print } from 'graphql';

import parseQuery from '../parseQuery';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: parseQuery', () => {
  test('basic', () => {
    // const state: ClientState = {
    //   server: _.cloneDeep(baseData),
    //   client: {},
    //   combined: _.cloneDeep(baseData),
    //   diff: {},
    // };
    // state.client = {
    //   Person: { A: null, F: { firstName: 'Cierra' } },
    //   Address: { A: { city: 'Torpchester' }, B: null },
    // };
    // delete state.combined.Person.A;
    // state.combined.Person.F = { firstName: 'Cierra' };
    // state.combined.Address.A.city = 'Torpchester';
    // delete state.combined.Address.B;
    // state.diff = { Person: { A: -1, F: 1 }, Address: { A: 0, B: -1 } };

    const { layers, base, partials } = parseQuery(
      baseSchema,
      parse(`{
        Person(filter: "lastName=Cole") {
          id
          firstName
          address {
            city
          }
          places(skip: 2) {
            street
          }
        }
      }`),
      {},
      true,
    );

    expect(layers).toEqual([
      {
        root: { field: 'Person' },
        field: { type: 'Person', isList: true },
        args: {
          filter: { lastName: { $eq: 'Cole' } },
          sort: [['createdAt', 'desc'], ['id', 'asc']],
          start: 0,
          end: undefined,
          fields: undefined,
          filterFields: ['lastName'],
          structuralFields: ['lastName', 'createdAt', 'id'],
          trace: undefined,
          unsorted: true,
        },
        scalarFields: { id: 'String' },
        relations: [
          {
            root: { type: 'Person', field: 'address' },
            field: { type: 'Address' },
            args: {
              filter: {},
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              start: 0,
              end: undefined,
              fields: undefined,
              filterFields: [],
              structuralFields: ['createdAt', 'id'],
              trace: undefined,
              unsorted: true,
            },
            scalarFields: { id: 'String' },
            relations: [],
            path: 'Person_address',
          },
          {
            root: { type: 'Person', field: 'places' },
            field: { type: 'Address', isList: true },
            args: {
              filter: {},
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              start: 2,
              end: undefined,
              fields: undefined,
              filterFields: [],
              structuralFields: ['createdAt', 'id'],
              trace: undefined,
              unsorted: true,
            },
            scalarFields: { id: 'String' },
            relations: [],
            path: 'Person_places',
          },
        ],
        path: 'Person',
      },
    ]);
    expect(clean(base)).toEqual(
      clean(`query($Person_places: Info, $Person: Info) {
        Person(filter: "lastName=Cole", info: $Person) {
          id
          firstName
          address {
            city
            id
            createdAt
          }
          places(skip: 2, info: $Person_places) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(partials.Person)).toEqual(
      clean(`query($ids: [String!], $Person_places: Info) {
        Person(ids: $ids) {
          id
          firstName
          address {
            city
            id
            createdAt
          }
          places(skip: 2, info: $Person_places) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(partials.Person_places)).toEqual(
      clean(`query($ids: [String!]) {
        Address(ids: $ids) {
          street
          id
          createdAt
        }
      }`),
    );
  });
});