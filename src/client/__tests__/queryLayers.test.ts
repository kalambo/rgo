import queryLayers from '../queryLayers';

const baseSchema = require('./setup/schema.json');

describe('client: queryLayers', () => {
  test('basic', () => {
    expect(
      JSON.stringify(
        queryLayers(baseSchema, [
          {
            name: 'people',
            filter: ['and', ['firstname', 'Delphia'], ['lastname', 'Cole']],
            fields: [
              'id',
              'firstname',
              {
                name: 'address',
                fields: ['city'],
              },
              {
                name: 'places',
                sort: 'street',
                start: 2,
                end: 4,
                fields: ['street'],
              },
            ],
          },
        ]),
      ),
    ).toEqual(
      JSON.stringify([
        {
          root: { field: 'people' },
          field: { type: 'people', isList: true },
          args: {
            filter: ['and', ['firstname', 'Delphia'], ['lastname', 'Cole']],
            sort: ['-createdat', 'id'],
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
                sort: ['street', '-createdat', 'id'],
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
