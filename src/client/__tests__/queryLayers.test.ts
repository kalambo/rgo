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
        people(filter: "firstname=Delphia, lastname=Cole") {
          id
          firstname
          address {
            city
          }
          places(sort: "street", start: 2, end: 4) {
            street
          }
        }
      }`),
      null,
    );

    expect(JSON.stringify(layers)).toEqual(
      JSON.stringify([
        {
          root: { field: 'people' },
          field: { type: 'people', isList: true },
          args: {
            filter: [
              'AND',
              [['firstname', '=', 'Delphia'], ['lastname', '=', 'Cole']],
            ],
            sort: [['createdat', 'desc'], ['id', 'asc']],
          },
          structuralFields: ['firstname', 'lastname', 'createdat', 'id'],
          scalarFields: { id: true, firstname: true },
          relations: [
            {
              root: { type: 'people', field: 'address' },
              field: { type: 'addresses' },
              args: {},
              structuralFields: [],
              scalarFields: { city: true },
              relations: [],
              path: 'people_address',
            },
            {
              root: { type: 'people', field: 'places' },
              field: { type: 'addresses', isList: true },
              args: {
                sort: [['street', 'asc'], ['createdat', 'desc'], ['id', 'asc']],
                start: 2,
                end: 4,
              },
              structuralFields: ['street', 'createdat', 'id'],
              scalarFields: { street: true },
              relations: [],
              path: 'people_places',
            },
          ],
          path: 'people',
        },
      ]),
    );
  });
});
