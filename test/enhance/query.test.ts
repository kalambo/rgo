import loadRgo, { compose, enhancers } from '../../src';

import { resolver, setup } from '../setup';

beforeEach(setup);

const enhance = compose(
  enhancers.limitQueries(
    type =>
      type === 'people' && [
        { filter: ['age', '=', 20] },
        { filter: ['age', '=', 40], fields: ['firstname', 'age'] },
      ],
  ),
);

describe('enhance: query', () => {
  test('simple', async () => {
    const rgo = loadRgo(enhance(resolver));
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        fields: [
          'firstname',
          'lastname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Delphia',
          lastname: 'Cole',
          address: { city: 'Tobyhaven' },
        },
        { firstname: 'Ena', lastname: null, address: null },
        {
          firstname: 'Esperanza',
          lastname: 'Boyle',
          address: { city: 'Lynchfurt' },
        },
        { firstname: null, lastname: 'Hansen', address: null },
      ],
    });
  });

  test('filter', async () => {
    const rgo = loadRgo(enhance(resolver));
    expect(
      await rgo.query({
        name: 'people',
        filter: ['firstname', 'Ena'],
        fields: [
          'firstname',
          'lastname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [{ firstname: 'Ena', lastname: null, address: null }],
    });
  });

  test('slice', async () => {
    const rgo = loadRgo(enhance(resolver));
    expect(
      await rgo.query({
        name: 'people',
        sort: 'firstname',
        start: 1,
        end: 3,
        fields: [
          'firstname',
          'lastname',
          {
            name: 'address',
            fields: ['city'],
          },
        ],
      }),
    ).toEqual({
      people: [
        { firstname: 'Ena', lastname: null, address: null },
        {
          firstname: 'Esperanza',
          lastname: 'Boyle',
          address: { city: 'Lynchfurt' },
        },
      ],
    });
  });

  test('filter hidden fields', async () => {
    const rgo = loadRgo(enhance(resolver));
    expect(
      await rgo.query({
        name: 'people',
        filter: ['lastname', 'in', ['Boyle', 'Cole', 'Cartwright']],
        sort: 'firstname',
        start: 1,
        end: 2,
        fields: ['firstname', 'lastname'],
      }),
    ).toEqual({
      people: [{ firstname: 'Esperanza', lastname: 'Boyle' }],
    });
  });

  test('relation', async () => {
    const rgo = loadRgo(enhance(resolver));
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
        { firstname: 'Ena', places: [] },
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

  // test('foreign', async () => {
  //   const rgo = loadRgo(enhance(resolver));
  //   expect(
  //     await rgo.query({
  //       name: 'addresses',
  //       sort: 'city',
  //       start: 1,
  //       end: 3,
  //       fields: [
  //         'city',
  //         {
  //           name: 'people',
  //           fields: ['firstname'],
  //         },
  //       ],
  //     }),
  //   ).toEqual({
  //     addresses: [
  //       {
  //         city: 'Lynchfurt',
  //         people: [{ firstname: 'Esperanza' }],
  //       },
  //       {
  //         city: 'Princeview',
  //         people: [{ firstname: 'Esperanza' }, { firstname: 'Delphia' }],
  //       },
  //     ],
  //   });
  // });

  test('relation with args', async () => {
    const rgo = loadRgo(enhance(resolver));
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
        { firstname: 'Ena', places: [] },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Princeview' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });
});
