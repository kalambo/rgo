import { clear, rgo, setup } from '../setup';

beforeEach(setup);
afterEach(clear);

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
      func: () => rgo.flush(),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Cartwright' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () =>
        rgo.set({ key: ['people', 'C', 'lastname'], value: 'Collier' }),
    });
    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Collier' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () => rgo.flush(),
      load: true,
    });
    results.push({
      people: [
        { firstname: 'Ena', lastname: 'Collier' },
        { firstname: 'Esperanza', lastname: 'Boyle' },
      ],
    });

    updates.push({
      func: () =>
        rgo.set({
          key: ['people', 'LOCAL__RECORD__0', 'firstname'],
          value: 'Brent',
        }),
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    updates.push({
      func: () =>
        rgo.set({
          key: ['people', 'LOCAL__RECORD__1', 'firstname'],
          value: 'Elissa',
        }),
    });
    results.push({
      people: [
        { firstname: 'Delphia', lastname: 'Cole' },
        { firstname: 'Elissa', lastname: null },
      ],
    });

    updates.push({
      func: () => rgo.set({ key: ['people', 'B'], value: null }),
    });
    results.push({
      people: [
        { firstname: 'Elissa', lastname: null },
        { firstname: 'Ena', lastname: 'Collier' },
      ],
    });

    updates.push({
      func: () => rgo.flush(),
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
    rgo.query(
      {
        name: 'people',
        sort: 'firstname',
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
