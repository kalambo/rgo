import { clearClient, client, setupClient } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('changes: basic', () => {
  test('test', async () => {
    let result;
    let setLoaded;
    const loaded = new Promise(resolve => (setLoaded = resolve));
    client.query(
      `{
        Person(sort: "firstName") {
          firstName
          address {
            city
          }
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
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });

    // client.set('Person', 'C', 'firstName', 'Brent');

    // expect(result).toEqual({
    //   Person: [
    //     { firstName: 'Brent', address: { city: 'Lynchfurt' } },
    //     { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
    //     { firstName: 'Ena', address: { city: 'Princeview' } },
    //     { firstName: 'Griffin', address: { city: 'Jeannebury' } },
    //     { firstName: null, address: null },
    //   ],
    // });
  });
});
