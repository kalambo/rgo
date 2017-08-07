import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('changes: root', () => {
  test('test', async done => {
    const query = `{
      Person(sort: "firstName", skip: 1, show: 2) {
        firstName
        lastName
      }
    }`;

    const results: any[] = [];
    const updates: { func: () => void; load?: true }[] = [];

    results.push({
      Person: [
        { firstName: 'Ena', lastName: 'Cartwright' },
        { firstName: 'Esperanza', lastName: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('Person', 'C', { lastName: 'Collier' }),
    });
    results.push({
      Person: [
        { firstName: 'Ena', lastName: 'Collier' },
        { firstName: 'Esperanza', lastName: 'Boyle' },
      ],
    });

    updates.push({
      func: () => client.set('Person', 'F', { firstName: 'Brent' }),
      load: true,
    });
    results.push({
      Person: [
        { firstName: 'Delphia', lastName: 'Cole' },
        { firstName: 'Ena', lastName: 'Collier' },
      ],
    });

    updates.push({
      func: () => client.set('Person', 'G', { firstName: 'Elissa' }),
      load: true,
    });
    results.push({
      Person: [
        { firstName: 'Delphia', lastName: 'Cole' },
        { firstName: 'Elissa', lastName: null },
      ],
    });

    updates.push({
      func: () => client.set('Person', 'B', null),
      load: true,
    });
    results.push({
      Person: [
        { firstName: 'Elissa', lastName: null },
        { firstName: 'Ena', lastName: 'Collier' },
      ],
    });

    let count = -1;
    let nextLoad = true;
    client.query(
      `{
        Person(sort: "firstName", skip: 1, show: 2) {
          firstName
          lastName
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
    );
  });
});
