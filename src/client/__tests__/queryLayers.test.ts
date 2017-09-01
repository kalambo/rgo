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
        person(filter: "lastname=Cole") {
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
      {},
      true,
    );

    expect(JSON.stringify(layers)).toEqual(
      JSON.stringify([
        {
          root: { field: 'person' },
          field: { type: 'person', isList: true },
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
          scalarFields: { id: true },
          relations: [
            {
              root: { type: 'person', field: 'address' },
              field: { type: 'address' },
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
              path: 'person_address',
            },
            {
              root: { type: 'person', field: 'places' },
              field: { type: 'address', isList: true },
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
              path: 'person_places',
            },
          ],
          path: 'person',
        },
      ]),
    );
  });
});
