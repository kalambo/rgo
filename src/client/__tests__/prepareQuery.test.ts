import { print } from 'graphql';
import * as _ from 'lodash';

import { prepareQuery } from '../query';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: prepareQuery', () => {
  test('basic', () => {
    const state: ClientState = {
      server: _.cloneDeep(baseData),
      client: {},
      combined: _.cloneDeep(baseData),
      diff: {},
    };
    state.client = {
      Person: { A: null, F: { firstName: 'Cierra' } },
      Address: { A: { city: 'Torpchester' }, B: null },
    };
    delete state.combined.Person.A;
    state.combined.Person.F = { firstName: 'Cierra' };
    state.combined.Address.A.city = 'Torpchester';
    delete state.combined.Address.B;
    state.diff = { Person: { A: -1, F: 1 }, Address: { A: 0, B: -1 } };

    const { layers, requests } = prepareQuery(
      baseSchema,
      state,
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

    expect(JSON.parse(JSON.stringify(layers))).toEqual([
      {
        root: { field: 'Person' },
        field: { type: 'Person', isList: true },
        args: {
          fields: null,
          filter: { lastName: { $eq: 'Cole' } },
          filterFields: ['lastName'],
          show: null,
          skip: 0,
          sort: [['createdAt', 'desc'], ['id', 'asc']],
          unsorted: true,
          offset: 0,
        },
        scalarFields: { id: true },
        relations: [
          {
            root: { type: 'Person', field: 'address' },
            field: { type: 'Address' },
            args: {
              fields: null,
              filter: {},
              filterFields: [],
              show: null,
              skip: 0,
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              unsorted: true,
              offset: 0,
            },
            scalarFields: { id: true },
            relations: [],
            funcs: {},
            state: {},
          },
          {
            root: { type: 'Person', field: 'places' },
            field: { type: 'Address', isList: true },
            args: {
              fields: null,
              filter: {},
              filterFields: [],
              show: null,
              skip: 2,
              sort: [['createdAt', 'desc'], ['id', 'asc']],
              unsorted: true,
              offset: 1,
            },
            scalarFields: { id: true },
            relations: [],
            funcs: {},
            state: {},
          },
        ],
        funcs: {},
        state: {},
      },
    ]);
    expect(
      requests.map(({ query, variables }) => ({
        query: clean(query),
        variables,
      })),
    ).toEqual([
      {
        query: clean(`query($Person_places: Extra, $Person: Extra) {
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
        variables: {
          Person: { show: 0, skip: 0 },
          Person_places: { show: 2, skip: 1 },
        },
      },
      {
        query: clean(`query($ids: [String!]) {
          Address(ids: $ids) {
            street
            id
            createdAt
          }
        }`),
        variables: {
          Person: { show: 0, skip: 0 },
          Person_places: { show: 2, skip: 1 },
          ids: ['A'],
        },
      },
      {
        query: clean(`query($ids: [String!], $Person_places: Extra) {
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
        variables: {
          Person: { show: 0, skip: 0 },
          Person_places: { show: 2, skip: 1 },
          ids: ['F'],
        },
      },
    ]);
  });
});
