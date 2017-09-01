import { clearClient, client, setupClient, simpleQuery } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: added', () => {
  test('simple: 0.5th', async () => {
    client.set('person', 'F', { firstname: 'Brent' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 1.5th', async () => {
    client.set('person', 'F', { firstname: 'Elissa' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Elissa', address: null },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2.5th', async () => {
    client.set('person', 'F', { firstname: 'Ernest' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: null },
      ],
    });
  });
  test('simple: 3.5th', async () => {
    client.set('person', 'F', { firstname: 'Faye' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4.5th', async () => {
    client.set('person', 'F', { firstname: 'Richie' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 0.5th, 1.5th', async () => {
    client.set('person', 'F', { firstname: 'Brent' });
    client.set('person', 'G', { firstname: 'Elissa' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Elissa', address: null },
      ],
    });
  });
  test('simple: 0.5th, 2.5th', async () => {
    client.set('person', 'F', { firstname: 'Brent' });
    client.set('person', 'G', { firstname: 'Ernest' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 0.5th, 2.5th, 3.5th', async () => {
    client.set('person', 'F', { firstname: 'Brent' });
    client.set('person', 'G', { firstname: 'Elissa' });
    client.set('person', 'H', { firstname: 'Faye' });
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Elissa', address: null },
      ],
    });
  });
});
