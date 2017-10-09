import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('mutations: basic', () => {
  test('simple', async () => {
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Elissa' }]);
    await client.commit([['people', 'A', 'firstname']]);
    expect(
      await client.query(
        `{
          people(filter:"id=A") {
            firstname
          }
        }`,
      ),
    ).toEqual({ people: [{ firstname: 'Elissa' }] });
  });
});
