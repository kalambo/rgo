import { parse, print } from 'graphql';

import parseQuery from '../parseQuery';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('client: parseQuery', () => {
  test('basic', () => {
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
          sort: [['createdat', 'desc'], ['id', 'asc']],
          start: 0,
          end: undefined,
          fields: undefined,
          filterFields: ['lastName'],
          structuralFields: ['lastName', 'createdat', 'id'],
          trace: undefined,
          unsorted: true,
        },
        scalarFields: { id: true },
        relations: [
          {
            root: { type: 'Person', field: 'address' },
            field: { type: 'Address' },
            args: {
              filter: {},
              sort: [['createdat', 'desc'], ['id', 'asc']],
              start: 0,
              end: undefined,
              fields: undefined,
              filterFields: [],
              structuralFields: ['createdat', 'id'],
              trace: undefined,
              unsorted: true,
            },
            scalarFields: { id: true },
            relations: [],
            path: 'Person_address',
          },
          {
            root: { type: 'Person', field: 'places' },
            field: { type: 'Address', isList: true },
            args: {
              filter: {},
              sort: [['createdat', 'desc'], ['id', 'asc']],
              start: 2,
              end: undefined,
              fields: undefined,
              filterFields: [],
              structuralFields: ['createdat', 'id'],
              trace: undefined,
              unsorted: true,
            },
            scalarFields: { id: true },
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
            createdat
          }
          places(skip: 2, info: $Person_places) {
            street
            id
            createdat
          }
          lastName
          createdat
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
            createdat
          }
          places(skip: 2, info: $Person_places) {
            street
            id
            createdat
          }
          lastName
          createdat
        }
      }`),
    );
    expect(clean(partials.Person_places)).toEqual(
      clean(`query($ids: [String!]) {
        Address(ids: $ids) {
          street
          id
          createdat
        }
      }`),
    );
  });
});
