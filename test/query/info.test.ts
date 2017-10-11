import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('query: basic', () => {
  test('simple', async () => {
    expect(
      await client.query(
        `{
          people(sort: "firstname") {
            firstname
            address {
              city
            }
          }
        }`,
        true,
      ),
    ).toEqual({
      data: {
        people: [
          {
            id: 'B',
            firstname: 'Delphia',
            address: { id: 'B', city: 'Tobyhaven' },
          },
          {
            id: 'C',
            firstname: 'Ena',
            address: { id: 'C', city: 'Princeview' },
          },
          {
            id: 'A',
            firstname: 'Esperanza',
            address: { id: 'A', city: 'Lynchfurt' },
          },
          {
            id: 'D',
            firstname: 'Griffin',
            address: { id: 'D', city: 'Jeannebury' },
          },
          { id: 'E', firstname: null, address: null },
        ],
      },
      spans: {
        '': 5,
        people: [
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
          people(sort: "firstname", skip: 1, show: 2) {
            firstname
            address {
              city
            }
          }
        }`,
        true,
      ),
    ).toEqual({
      data: {
        people: [
          {
            id: 'C',
            firstname: 'Ena',
            address: { id: 'C', city: 'Princeview' },
          },
          {
            id: 'A',
            firstname: 'Esperanza',
            address: { id: 'A', city: 'Lynchfurt' },
          },
        ],
      },
      spans: {
        '': 2,
        people: [
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
          people(sort: "firstname", skip: 1, show: 2) {
            firstname
            places {
              city
            }
          }
        }`,
        true,
      ),
    ).toEqual({
      data: {
        people: [
          {
            id: 'C',
            firstname: 'Ena',
            places: [
              null,
              { id: 'C', city: 'Princeview' },
              { id: 'D', city: 'Jeannebury' },
            ],
          },
          {
            id: 'A',
            firstname: 'Esperanza',
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
        people: [
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
          people(sort: "firstname", skip: 1, show: 2) {
            firstname
            places(sort: "city") {
              city
            }
          }
        }`,
        true,
      ),
    ).toEqual({
      data: {
        people: [
          {
            id: 'C',
            firstname: 'Ena',
            places: [
              { id: 'D', city: 'Jeannebury' },
              { id: 'C', city: 'Princeview' },
            ],
          },
          {
            id: 'A',
            firstname: 'Esperanza',
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
        people: [
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
          people(sort: "firstname", skip: 1, show: 2) {
            firstname
            address {
              city
            }
            places {
              city
            }
          }
        }`,
        true,
      ),
    ).toEqual({
      data: {
        people: [
          {
            id: 'C',
            firstname: 'Ena',
            address: { id: 'C', city: 'Princeview' },
            places: [
              null,
              { id: 'C', city: 'Princeview' },
              { id: 'D', city: 'Jeannebury' },
            ],
          },
          {
            id: 'A',
            firstname: 'Esperanza',
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
        people: [
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
