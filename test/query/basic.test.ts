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
      ),
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
      await client.query(
        `{
          people(filter: "firstname=Delphia") {
            firstname
            address {
              city
            }
          }
        }`,
      ),
    ).toEqual({
      people: [{ firstname: 'Delphia', address: { city: 'Tobyhaven' } }],
    });
  });

  test('slice', async () => {
    expect(
      await client.query(
        `{
          people(sort: "firstname", start: 1, end: 3) {
            firstname
            address {
              city
            }
          }
        }`,
      ),
    ).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('relation', async () => {
    expect(
      await client.query(
        `{
          people(sort: "firstname", start: 1, end: 3) {
            firstname
            places {
              city
            }
          }
        }`,
      ),
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
      await client.query(
        `{
          people(sort: "firstname", start: 1, end: 3) {
            firstname
            places(sort: "city") {
              city
            }
          }
        }`,
      ),
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
});
