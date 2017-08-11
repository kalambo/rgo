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
          {
            id: 'B',
            firstName: 'Delphia',
            address: { id: 'B', city: 'Tobyhaven' },
          },
          {
            id: 'C',
            firstName: 'Ena',
            address: { id: 'C', city: 'Princeview' },
          },
          {
            id: 'A',
            firstName: 'Esperanza',
            address: { id: 'A', city: 'Lynchfurt' },
          },
          {
            id: 'D',
            firstName: 'Griffin',
            address: { id: 'D', city: 'Jeannebury' },
          },
          { id: 'E', firstName: null, address: null },
        ],
      },
      spans: {
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
          {
            id: 'C',
            firstName: 'Ena',
            address: { id: 'C', city: 'Princeview' },
          },
          {
            id: 'A',
            firstName: 'Esperanza',
            address: { id: 'A', city: 'Lynchfurt' },
          },
        ],
      },
      spans: {
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
            id: 'C',
            firstName: 'Ena',
            places: [
              null,
              { id: 'C', city: 'Princeview' },
              { id: 'D', city: 'Jeannebury' },
            ],
          },
          {
            id: 'A',
            firstName: 'Esperanza',
            places: [
              { id: 'A', city: 'Lynchfurt' },
              { id: 'B', city: 'Tobyhaven' },
              { id: 'C', city: 'Princeview' },
            ],
          },
        ],
      },
      spans: {
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
            id: 'C',
            firstName: 'Ena',
            places: [
              { id: 'D', city: 'Jeannebury' },
              { id: 'C', city: 'Princeview' },
            ],
          },
          {
            id: 'A',
            firstName: 'Esperanza',
            places: [
              { id: 'A', city: 'Lynchfurt' },
              { id: 'C', city: 'Princeview' },
              { id: 'B', city: 'Tobyhaven' },
            ],
          },
        ],
      },
      spans: {
        '': 5,
        Person: [
          { '': 2, places: [{ '': 1 }, { '': 1 }] },
          { '': 3, places: [{ '': 1 }, { '': 1 }, { '': 1 }] },
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
            address {
              city
            }
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
            id: 'C',
            firstName: 'Ena',
            address: { id: 'C', city: 'Princeview' },
            places: [
              null,
              { id: 'C', city: 'Princeview' },
              { id: 'D', city: 'Jeannebury' },
            ],
          },
          {
            id: 'A',
            firstName: 'Esperanza',
            address: { id: 'A', city: 'Lynchfurt' },
            places: [
              { id: 'A', city: 'Lynchfurt' },
              { id: 'B', city: 'Tobyhaven' },
              { id: 'C', city: 'Princeview' },
            ],
          },
        ],
      },
      spans: {
        '': 6,
        Person: [
          {
            '': 3,
            address: [{ '': 1 }, 2],
            places: [{ '': 1 }, { '': 1 }, { '': 1 }],
          },
          {
            '': 3,
            address: [{ '': 1 }, 2],
            places: [{ '': 1 }, { '': 1 }, { '': 1 }],
          },
        ],
      },
    });
  });
});
