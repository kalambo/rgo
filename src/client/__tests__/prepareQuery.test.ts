import { print } from 'graphql';
import * as _ from 'lodash';

import prepareQuery from '../prepareQuery';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: prepareQuery', () => {
  test('basic', () => {
    const { apiQuery, layers, readQuery } = prepareQuery(
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

    expect(clean(apiQuery)).toBe(
      clean(`query($Person: Extra, $Person_places: Extra) {
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
    expect(clean(layers.Person.query)).toBe(
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
    expect(clean(layers.Person_places.query)).toBe(
      clean(`query($ids: [String!]) {
        Address(ids: $ids) {
          street
          id
          createdAt
        }
      }`),
    );
    expect(clean(print(readQuery))).toBe(
      clean(`{
        Person(filter: "lastName=Cole") {
          id
          address {
            id
          }
          places(skip: 2) {
            id
          }
        }
      }`),
    );

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

    expect(layers.Person.extra(state)).toEqual({
      slice: { skip: 0, show: 0 },
      ids: ['F'],
    });
    expect(layers.Person_places.extra(state)).toEqual({
      slice: { skip: 1, show: 2 },
      ids: ['A'],
    });
  });
});
