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
        people(filter: "lastname=Cole") {
          id
          firstname
          address {
            city
          }
          places(skip: 2, show: 2, sort: "street") {
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
            filter: { lastname: { $eq: 'Cole' } },
            sort: [['createdat', 'desc'], ['id', 'asc']],
            start: 0,
            end: undefined,
            fields: undefined,
            trace: undefined,
            ids: undefined,
          },
          structuralFields: ['lastname', 'createdat', 'id'],
          scalarFields: { id: true, firstname: true },
          relations: [
            {
              root: { type: 'people', field: 'address' },
              field: { type: 'addresses' },
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
              scalarFields: { city: true },
              relations: [],
              path: 'people_address',
            },
            {
              root: { type: 'people', field: 'places' },
              field: { type: 'addresses', isList: true },
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
