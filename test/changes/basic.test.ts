import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('changes: root', () => {
  test('test', async done => {
    const query = `{
      person(sort: "firstname", skip: 1, show: 2) {
        firstname
        lastname
      }
    }`;

    const results: any[] = [];
    const updates: { func: () => void; load?: true }[] = [];

    results.push({
      person: [
        { firstname: 'Ena', lastname: 'Cartwright' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('person', 'C', { lastname: 'Collier' }),
    });
    results.push({
      person: [
        { firstname: 'Ena', lastname: 'Collier' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('person', 'F', { firstname: 'Brent' }),
      load: true,
    });
    results.push({
      person: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    updates.push({
      func: () => client.set('person', 'G', { firstname: 'Elissa' }),
      load: true,
    });
    results.push({
      person: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Elissa', lastname: null },
      ],
    });

    updates.push({
      func: () => client.set('person', 'B', null),
      load: true,
    });
    results.push({
      person: [
        { firstname: 'Elissa', lastname: null },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    let count = -1;
    let nextLoad = false;
    client.query(
      `{
        person(sort: "firstname", skip: 1, show: 2) {
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
