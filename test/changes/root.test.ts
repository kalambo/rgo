import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('changes: root', () => {
  test('test', async () => {
    let result;
    let setLoaded;
    const loaded = new Promise(resolve => (setLoaded = resolve));
    client.query(
      `{
        Person(sort: "firstName", skip: 1, show: 2) {
          firstName
        }
      }`,
      {},
      false,
      value => {
        result = value;
        if (value !== Symbol.for('loading')) setLoaded();
      },
    );
    await loaded;

    expect(result).toEqual({
      Person: [{ firstName: 'Ena' }, { firstName: 'Esperanza' }],
    });

    // client.set('Person', 'F', { firstName: 'Brent' });
    // expect(result).toEqual({
    //   Person: [{ firstName: 'Delphia' }, { firstName: 'Ena' }],
    // });

    // client.set('Person', 'G', { firstName: 'Elissa' });
    // expect(result).toEqual({
    //   Person: [{ firstName: 'Delphia' }, { firstName: 'Elissa' }],
    // });
  });
});
