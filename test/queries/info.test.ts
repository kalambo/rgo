import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: basic', () => {
  test('simple', async () => {
    expect(
      await client.query(
        `{
          Person(sort: "firstName") {
            firstName
            address {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        Person: [
          { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
          { firstName: 'Ena', address: { city: 'Princeview' } },
          { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
          { firstName: 'Griffin', address: { city: 'Jeannebury' } },
          { firstName: null, address: null },
        ],
      },
      cols: {
        '': 5,
        Person: [
          { '': 1, address: [{ '': 1 }] },
          { '': 1, address: [{ '': 1 }] },
          { '': 1, address: [{ '': 1 }] },
          { '': 1, address: [{ '': 1 }] },
          { '': 1, address: [{ '': 1 }] },
        ],
      },
    });
  });

  test('slice', async () => {
    expect(
      await client.query(
        `{
          Person(sort: "firstName", skip: 1, show: 2) {
            firstName
            address {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        Person: [
          { firstName: 'Ena', address: { city: 'Princeview' } },
          { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        ],
      },
      cols: {
        '': 2,
        Person: [
          { '': 1, address: [{ '': 1 }] },
          { '': 1, address: [{ '': 1 }] },
        ],
      },
    });
  });

  test('relation', async () => {
    expect(
      await client.query(
        `{
          Person(sort: "firstName", skip: 1, show: 2) {
            firstName
            places {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        Person: [
          {
            firstName: 'Ena',
            places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
          },
          {
            firstName: 'Esperanza',
            places: [
              { city: 'Lynchfurt' },
              { city: 'Tobyhaven' },
              { city: 'Princeview' },
            ],
          },
        ],
      },
      cols: {
        '': 6,
        Person: [
          { '': 3, places: [{ '': 1 }, { '': 1 }, { '': 1 }] },
          { '': 3, places: [{ '': 1 }, { '': 1 }, { '': 1 }] },
        ],
      },
    });
  });

  test('relation with sort', async () => {
    expect(
      await client.query(
        `{
          Person(sort: "firstName", skip: 1, show: 2) {
            firstName
            places(sort: "city") {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        Person: [
          {
            firstName: 'Ena',
            places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
          },
          {
            firstName: 'Esperanza',
            places: [
              { city: 'Lynchfurt' },
              { city: 'Princeview' },
              { city: 'Tobyhaven' },
            ],
          },
        ],
      },
      cols: {
        '': 5,
        Person: [
          { '': 2, places: [{ '': 1 }, { '': 1 }] },
          { '': 3, places: [{ '': 1 }, { '': 1 }, { '': 1 }] },
        ],
      },
    });
  });
});
