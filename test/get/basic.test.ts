import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('get: basic', () => {
  test('single', async () => {
    expect(await client.get([['people', 'A', 'firstname']])).toEqual([
      'Esperanza',
    ]);
  });

  test('multi', async () => {
    expect(
      await client.get([
        ['people', 'A', 'firstname'],
        ['people', 'A', 'lastname'],
        ['people', 'B', 'firstname'],
      ]),
    ).toEqual(['Esperanza', 'Boyle', 'Delphia']);
  });
});
