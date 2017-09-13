import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('changes: root', () => {
  test('test', async done => {
    const query = `{
      people(sort: "firstname", skip: 1, show: 2) {
        firstname
        lastname
      }
    }`;

    const results: any[] = [];
    const updates: { func: () => void; load?: true }[] = [];

    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Cartwright' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('people', 'C', { lastname: 'Collier' }),
    });
    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Collier' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('people', 'F', { firstname: 'Brent' }),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    updates.push({
      func: () => client.set('people', 'G', { firstname: 'Elissa' }),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Elissa', lastname: null },
      ],
    });

    updates.push({
      func: () => client.set('people', 'B', null),
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
      `{
        people(sort: "firstname", skip: 1, show: 2) {
          firstname
          lastname
        }
      }`,
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
      true,
    );
  });
});
