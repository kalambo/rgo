import { print } from 'graphql';
import * as _ from 'lodash';

import { prepareQuery } from '../query';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: prepareQuery', () => {
  test('basic', () => {
    const { queryLayers, rootQuery, subQueries } = prepareQuery(
      baseSchema,
      `{
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
      }`,
      {},
      true,
    );

    expect(queryLayers).toEqual([
      {
        root: { field: 'Person' },
        field: { type: 'Person', isList: true },
        path: 'Person',
        args: {
          fields: null,
          filter: { lastName: { $eq: 'Cole' } },
          filterFields: ['lastName'],
          show: null,
          skip: 0,
          sort: [['createdAt', 'desc'], ['id', 'asc']],
          unsorted: true,
        },
        scalarFields: { id: true },
        relations: [
          {
            root: { type: 'Person', field: 'address' },
            field: { type: 'Address' },
            path: 'Person_address',
            args: {
              fields: null,
              filter: {},
              filterFields: [],
              show: null,
              skip: 0,
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              unsorted: true,
            },
            scalarFields: { id: true },
            relations: [],
          },
          {
            root: { type: 'Person', field: 'places' },
            field: { type: 'Address', isList: true },
            path: 'Person_places',
            args: {
              fields: null,
              filter: {},
              filterFields: [],
              show: null,
              skip: 2,
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              unsorted: true,
            },
            scalarFields: { id: true },
            relations: [],
          },
        ],
      },
    ]);
    expect(clean(rootQuery)).toBe(
      clean(`query($Person_places: Extra, $Person: Extra) {
        Person(filter: "lastName=Cole", extra: $Person) {
          id
          firstName
          address {
            city
            id
            createdAt
          }
          places(skip: 2, extra: $Person_places) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(subQueries.Person)).toBe(
      clean(`query($ids: [String!], $Person_places: Extra) {
        Person(ids: $ids) {
          id
          firstName
          address {
            city
            id
            createdAt
          }
          places(skip: 2, extra: $Person_places) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(subQueries.Person_places)).toBe(
      clean(`query($ids: [String!]) {
        Address(ids: $ids) {
          street
          id
          createdAt
        }
      }`),
    );

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

    // expect(layers.Person.extra(state)).toEqual({
    //   slice: { skip: 0, show: 0 },
    //   ids: ['F'],
    // });
    // expect(layers.Person_places.extra(state)).toEqual({
    //   slice: { skip: 1, show: 2 },
    //   ids: ['A'],
    // });
  });
});
