import { clearClient, client, setupClient, simpleQuery } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: added', () => {
  test('simple: 0.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 1.5th', async () => {
    client.set('Person', 'F', { firstName: 'Elissa' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Elissa', address: null },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2.5th', async () => {
    client.set('Person', 'F', { firstName: 'Ernest' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Ernest', address: null },
      ],
    });
  });
  test('simple: 3.5th', async () => {
    client.set('Person', 'F', { firstName: 'Faye' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4.5th', async () => {
    client.set('Person', 'F', { firstName: 'Richie' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 0.5th, 1.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Elissa' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Elissa', address: null },
      ],
    });
  });
  test('simple: 0.5th, 2.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Ernest' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 0.5th, 2.5th, 3.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Elissa' });
    client.set('Person', 'H', { firstName: 'Faye' });
    expect(await client.query(simpleQuery)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Elissa', address: null },
      ],
    });
  });
});
