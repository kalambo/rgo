import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('change: root', () => {
  test('test', async done => {
    const results: any[] = [];
    const updates: { func: () => void; load?: true }[] = [];

    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Cartwright' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () =>
        client.set([{ key: ['people', 'C', 'lastname'], value: 'Collier' }]),
    });
    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Collier' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () =>
        client.set([{ key: ['people', 'F', 'firstname'], value: 'Brent' }]),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    updates.push({
      func: () =>
        client.set([{ key: ['people', 'G', 'firstname'], value: 'Elissa' }]),
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Elissa', lastname: null },
      ],
    });

    updates.push({
      func: () => client.set([{ key: ['people', 'B'], value: null }]),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Elissa', lastname: null },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    let count = -1;
    let nextLoad = true;
    client.query(
      {
        name: 'people',
        sort: ['firstname'],
        start: 1,
        end: 3,
        fields: ['firstname', 'lastname'],
      },
      value => {
        if (nextLoad) {
          expect(value).toBe(null);
          nextLoad = false;
        } else {
          count += 1;
          expect(value).toEqual(results[count]);
          if (updates[count]) {
            nextLoad = updates[count].load;
            updates[count].func();
          } else {
            done();
          }
        }
      },
    );
  });
});
