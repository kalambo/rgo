import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: basic', () => {
  test('simple', async () => {
    expect(
      await client.query(
        `{
          person(sort: "firstname") {
            firstname
            address {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        person: [
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
        person: [
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
          person(sort: "firstname", skip: 1, show: 2) {
            firstname
            address {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        person: [
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
        person: [
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
          person(sort: "firstname", skip: 1, show: 2) {
            firstname
            places {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        person: [
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
        person: [
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
          person(sort: "firstname", skip: 1, show: 2) {
            firstname
            places(sort: "city") {
              city
            }
          }
        }`,
        { info: true },
      ),
    ).toEqual({
      data: {
        person: [
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
        person: [
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
          person(sort: "firstname", skip: 1, show: 2) {
            firstname
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
        person: [
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
        person: [
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
