import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('fields: basic', () => {
  test('simple', async () => {
    expect(
      JSON.stringify(await client.field({ key: 'people.A.firstname' })),
    ).toEqual(
      JSON.stringify({
        scalar: 'string',
        isList: false,
        rules: {},
        value: 'Esperanza',
        invalid: false,
      }),
    );
  });
});
