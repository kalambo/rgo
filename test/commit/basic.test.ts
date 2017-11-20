import { rgo, setup } from '../setup';

import { newIdPrefix } from '../../src/utils';

beforeEach(setup);

describe('commit: basic', () => {
  test('insert', async () => {
    const id = `${newIdPrefix}1`;
    rgo.set({ key: ['people', id, 'firstname'], value: 'Ted' });
    await rgo.commit(['people', id, 'firstname']);
    expect(await rgo.query({ name: 'people', fields: ['firstname'] })).toEqual({
      people: [
        { firstname: 'Ted' },
        { firstname: 'Esperanza' },
        { firstname: 'Delphia' },
        { firstname: 'Ena' },
        { firstname: 'Griffin' },
        { firstname: null },
      ],
    });
  });

  test('update', async () => {
    rgo.set(
      { key: ['people', 'A', 'firstname'], value: 'Elissa' },
      { key: ['people', 'B', 'firstname'], value: null },
    );
    await rgo.commit(
      ['people', 'A', 'firstname'],
      ['people', 'B', 'firstname'],
    );
    expect(await rgo.query({ name: 'people', fields: ['firstname'] })).toEqual({
      people: [
        { firstname: 'Elissa' },
        { firstname: null },
        { firstname: 'Ena' },
        { firstname: 'Griffin' },
        { firstname: null },
      ],
    });
  });

  test('delete', async () => {
    rgo.set({ key: ['people', 'A'], value: null });
    await rgo.commit(['people', 'A']);
    expect(await rgo.query({ name: 'people', fields: ['firstname'] })).toEqual({
      people: [
        { firstname: 'Delphia' },
        { firstname: 'Ena' },
        { firstname: 'Griffin' },
        { firstname: null },
      ],
    });
  });

  test('insert related', async () => {
    const ids = [`${newIdPrefix}1`, `${newIdPrefix}2`];
    rgo.set(
      { key: ['addresses', ids[0], 'city'], value: 'London' },
      { key: ['people', ids[1], 'firstname'], value: 'Ted' },
      { key: ['people', ids[1], 'address'], value: ids[0] },
    );
    await rgo.commit(
      ['addresses', ids[0], 'city'],
      ['people', ids[1], 'firstname'],
      ['people', ids[1], 'address'],
    );
    expect(
      await rgo.query({
        name: 'people',
        fields: ['firstname', { name: 'address', fields: ['city'] }],
      }),
    ).toEqual({
      people: [
        { firstname: 'Ted', address: { city: 'London' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });

  test('insert update ids', async () => {
    const id = `${newIdPrefix}1`;
    rgo.set({ key: ['addresses', id, 'city'], value: 'London' });
    rgo.set({ key: ['people', 'A', 'address'], value: id });
    await rgo.commit(['addresses', id, 'city']);
    expect(
      await rgo.query({
        name: 'people',
        fields: ['firstname', { name: 'address', fields: ['city'] }],
      }),
    ).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'London' } },
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });
});
