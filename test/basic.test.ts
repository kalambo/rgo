import { clearClient, client, setupClient } from './setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('end to end: basic', () => {
  test('test', async () => {
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
        {},
        false,
      ),
    ).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
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
        {},
        false,
      ),
    ).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
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
        {},
        false,
      ),
    ).toEqual({
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
        {},
        false,
      ),
    ).toEqual({
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
    });
  });
});
