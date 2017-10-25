import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

const query = {
  name: 'people',
  sort: ['firstname'],
  start: 1,
  end: 3,
  fields: [
    'firstname',
    {
      name: 'address',
      fields: ['city'],
    },
  ],
};

describe('query: added', () => {
  test('simple: 0.5th', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Brent' }]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 1.5th', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Elissa' }]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Elissa', address: null },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2.5th', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Ernest' }]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: null },
      ],
    });
  });
  test('simple: 3.5th', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Faye' }]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4.5th', async () => {
    client.set([{ key: ['people', 'F', 'firstname'], value: 'Richie' }]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 0.5th, 1.5th', async () => {
    client.set([
      { key: ['people', 'F', 'firstname'], value: 'Brent' },
      { key: ['people', 'G', 'firstname'], value: 'Elissa' },
    ]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Elissa', address: null },
      ],
    });
  });
  test('simple: 0.5th, 2.5th', async () => {
    client.set([
      { key: ['people', 'F', 'firstname'], value: 'Brent' },
      { key: ['people', 'G', 'firstname'], value: 'Ernest' },
    ]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 0.5th, 2.5th, 3.5th', async () => {
    client.set([
      { key: ['people', 'F', 'firstname'], value: 'Brent' },
      { key: ['people', 'G', 'firstname'], value: 'Elissa' },
      { key: ['people', 'H', 'firstname'], value: 'Faye' },
    ]);
    expect(await client.query(query)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Elissa', address: null },
      ],
    });
  });
});
