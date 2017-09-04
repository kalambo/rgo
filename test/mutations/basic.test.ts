import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('mutations: basic', () => {
  test('simple', async () => {
    client.set('people', 'A', { firstname: 'Elissa' });
    await client.mutate(['people.A.firstname']);
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
