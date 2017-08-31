import { parse, print } from 'graphql';

import queryLayers from '../queryLayers';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: queryLayers', () => {
  test('basic', () => {
    const layers = queryLayers(
      baseSchema,
      parse(`{
        Person(filter: "lastName=Cole") {
          id
          firstName
          address {
            city
          }
          places(skip: 2, show: 2, sort: "street") {
            street
          }
        }
      }`),
      {},
      true,
    );

    expect(JSON.stringify(layers)).toEqual(
      JSON.stringify([
        {
          root: { field: 'Person' },
          field: { type: 'Person', isList: true },
          args: {
            filter: { lastName: { $eq: 'Cole' } },
            sort: [['createdat', 'desc'], ['id', 'asc']],
            start: 0,
            end: undefined,
            fields: undefined,
            trace: undefined,
            ids: undefined,
          },
          structuralFields: ['lastName', 'createdat', 'id'],
          scalarFields: { id: true },
          relations: [
            {
              root: { type: 'Person', field: 'address' },
              field: { type: 'Address' },
              args: {
                filter: {},
                sort: [],
                start: 0,
                end: undefined,
                fields: undefined,
                trace: undefined,
                ids: undefined,
              },
              structuralFields: [],
              scalarFields: { id: true },
              relations: [],
              path: 'Person_address',
            },
            {
              root: { type: 'Person', field: 'places' },
              field: { type: 'Address', isList: true },
              args: {
                filter: {},
                sort: [['street', 'asc'], ['createdat', 'desc'], ['id', 'asc']],
                start: 2,
                end: 4,
                fields: undefined,
                trace: undefined,
                ids: undefined,
              },
              structuralFields: ['street', 'createdat', 'id'],
              scalarFields: { id: true },
              relations: [],
              path: 'Person_places',
            },
          ],
          path: 'Person',
        },
      ]),
    );
    // expect(clean(base)).toEqual(
    //   clean(`query($Person_places: Info, $Person: Info) {
    //     Person(filter: "lastName=Cole", info: $Person) {
    //       id
    //       firstName
    //       address {
    //         city
    //         id
    //         createdat
    //       }
    //       places(skip: 2, info: $Person_places) {
    //         street
    //         id
    //         createdat
    //       }
    //       lastName
    //       createdat
    //     }
    //   }`),
    // );
    // expect(clean(partials.Person)).toEqual(
    //   clean(`query($ids: [String!], $Person_places: Info) {
    //     Person(ids: $ids) {
    //       id
    //       firstName
    //       address {
    //         city
    //         id
    //         createdat
    //       }
    //       places(skip: 2, info: $Person_places) {
    //         street
    //         id
    //         createdat
    //       }
    //       lastName
    //       createdat
    //     }
    //   }`),
    // );
    // expect(clean(partials.Person_places)).toEqual(
    //   clean(`query($ids: [String!]) {
    //     Address(ids: $ids) {
    //       street
    //       id
    //       createdat
    //     }
    //   }`),
    // );
  });
});
