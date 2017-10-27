import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('query: basic', () => {
  test('simple', async () => {
    expect(
      await client.query({
        name: 'people',
        sort: 'firstname',
        fields: [
          'firstname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });

  test('filter', async () => {
    expect(
      await client.query({
        name: 'people',
        filter: ['firstname', 'Delphia'],
        fields: [
          'firstname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [{ firstname: 'Delphia', address: { city: 'Tobyhaven' } }],
    });
  });

  test('slice', async () => {
    expect(
      await client.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('relation', async () => {
    expect(
      await client.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          {
            name: 'places',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Tobyhaven' },
            { city: 'Princeview' },
          ],
        },
      ],
    });
  });

  test('relation with sort', async () => {
    expect(
      await client.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          {
            name: 'places',
            sort: 'city',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Princeview' },
            { city: 'Tobyhaven' },
          ],
        },
      ],
    });
  });

  test('relation ids', async () => {
    expect(
      await client.query([
        {
          name: 'people',
          sort: 'firstname',
          fields: ['firstname', 'address', 'places'],
        },
      ]),
    ).toEqual({
      people: [
        { firstname: 'Delphia', address: 'B', places: ['B', 'C', null] },
        { firstname: 'Ena', address: 'C', places: [null, 'C', 'D'] },
        { firstname: 'Esperanza', address: 'A', places: ['A', 'B', 'C'] },
        { firstname: 'Griffin', address: 'D', places: ['D'] },
        { firstname: null, address: null, places: [] },
      ],
    });
  });

  test('alias', async () => {
    expect(
      await client.query([
        {
          name: 'people',
          alias: 'a',
          filter: 'A',
          fields: ['firstname', 'lastname'],
        },
        {
          name: 'people',
          alias: 'b',
          filter: 'B',
          fields: [
            'firstname',
            {
              name: 'address',
              alias: 'c',
              fields: ['city'],
            },
          ],
        },
      ]),
    ).toEqual({
      a: [{ firstname: 'Esperanza', lastname: 'Boyle' }],
      b: [{ firstname: 'Delphia', c: { city: 'Tobyhaven' } }],
    });
  });

  test('relation ids', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Brent' }]);
    expect(
      await client.query([
        {
          name: 'people',
          sort: 'firstname',
          fields: ['firstname', 'address', 'places'],
        },
      ]),
    ).toEqual({
      people: [
        { firstname: 'Delphia', address: 'B', places: ['B', 'C', null] },
        { firstname: 'Ena', address: 'C', places: [null, 'C', 'D'] },
        { firstname: 'Esperanza', address: 'A', places: ['A', 'B', 'C'] },
        { firstname: 'Griffin', address: 'D', places: ['D'] },
        { firstname: null, address: null, places: [] },
      ],
    });
  });
});
