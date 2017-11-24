import { rgo, setup } from '../setup';

beforeEach(setup);

describe('query: basic', () => {
  test('simple', async () => {
    expect(
      await rgo.query({
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
      await rgo.query({
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
      await rgo.query({
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
      await rgo.query({
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

  test('foreign', async () => {
    expect(
      await rgo.query({
        name: 'addresses',
        sort: 'city',
        start: 1,
        end: 3,
        fields: [
          'city',
          {
            name: 'people',
            fields: ['firstname'],
          },
        ],
      }),
    ).toEqual({
      addresses: [
        {
          city: 'Lynchfurt',
          people: [{ firstname: 'Esperanza' }],
        },
        {
          city: 'Princeview',
          people: [
            { firstname: 'Esperanza' },
            { firstname: 'Delphia' },
            { firstname: 'Ena' },
          ],
        },
      ],
    });
  });

  test('relation with args', async () => {
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          {
            name: 'places',
            sort: 'city',
            start: 1,
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Ena',
          places: [{ city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Princeview' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });

  test('relation ids', async () => {
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        fields: ['firstname', 'address', 'places'],
      }),
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
      await rgo.query(
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
      ),
    ).toEqual({
      a: [{ firstname: 'Esperanza', lastname: 'Boyle' }],
      b: [{ firstname: 'Delphia', c: { city: 'Tobyhaven' } }],
    });
  });

  test('relation ids mixed', async () => {
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          'places',
          {
            name: 'places',
            alias: 'p',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Ena',
          places: [null, 'C', 'D'],
          p: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: ['A', 'B', 'C'],
          p: [
            { city: 'Lynchfurt' },
            { city: 'Tobyhaven' },
            { city: 'Princeview' },
          ],
        },
      ],
    });
  });

  test('duplicate fields', async () => {
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        fields: ['firstname', 'firstname'],
      }),
    ).toEqual({
      people: [
        { firstname: 'Delphia' },
        { firstname: 'Ena' },
        { firstname: 'Esperanza' },
        { firstname: 'Griffin' },
        { firstname: null },
      ],
    });
  });

  test('null filter', async () => {
    expect(
      await rgo.query({
        name: 'people',
        filter: null,
        fields: ['firstname', 'firstname'],
      }),
    ).toEqual({
      people: [],
    });
  });
});
