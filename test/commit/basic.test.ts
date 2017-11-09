import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('commit: basic', () => {
  test('simple', async () => {
    client.set({ key: ['people', 'A', 'firstname'], value: 'Elissa' });
    await client.commit(['people', 'A', 'firstname']);
    expect(
      await client.query({
        name: 'people',
        filter: 'A',
        fields: ['firstname'],
      }),
    ).toEqual({ people: [{ firstname: 'Elissa' }] });
  });
});
