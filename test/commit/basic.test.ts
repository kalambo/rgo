import { clear, rgo, setup } from '../setup';

beforeEach(setup);
afterEach(clear);

describe('commit: basic', () => {
  test('simple', async () => {
    rgo.set({ key: ['people', 'A', 'firstname'], value: 'Elissa' });
    await rgo.commit(['people', 'A', 'firstname']);
    expect(
      await rgo.query({
        name: 'people',
        filter: 'A',
        fields: ['firstname'],
      }),
    ).toEqual({ people: [{ firstname: 'Elissa' }] });
  });
});
