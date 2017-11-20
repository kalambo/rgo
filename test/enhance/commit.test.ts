import loadRgo, { compose, enhancers } from '../../src';
import network from '../../src/network';
import { newIdPrefix } from '../../src/utils';

import { resolver, setup } from '../setup';

beforeEach(setup);

const timestamp = new Date();

const enhance = compose(
  enhancers.base(async (resolver, request, schema) => {
    const response = await resolver(
      network.request(
        'decode',
        schema,
        network.request('encode', schema, request),
      ),
    );
    return network.response(
      'decode',
      schema,
      network.response('encode', schema, response),
    );
  }),
  enhancers.onUpdate(({ record }) => {
    if (record && record.lastname) throw new Error('Not authorized');
    return { modifiedat: timestamp };
  }),
);

describe('enhance: commit', () => {
  test('insert', async () => {
    const rgo = loadRgo(enhance(resolver));
    const id = `${newIdPrefix}1`;
    rgo.set({ key: ['people', id, 'firstname'], value: 'Ted' });
    await rgo.commit(['people', id, 'firstname']);
    expect(
      await rgo.query({ name: 'people', fields: ['firstname', 'modifiedat'] }),
    ).toEqual({
      people: [
        { firstname: 'Ted', modifiedat: timestamp },
        { firstname: 'Esperanza', modifiedat: null },
        { firstname: 'Delphia', modifiedat: null },
        { firstname: 'Ena', modifiedat: null },
        { firstname: 'Griffin', modifiedat: null },
        { firstname: null, modifiedat: null },
      ],
    });
  });

  test('update', async () => {
    const rgo = loadRgo(enhance(resolver));
    rgo.set(
      { key: ['people', 'A', 'firstname'], value: 'Elissa' },
      { key: ['people', 'B', 'firstname'], value: null },
    );
    await rgo.commit(
      ['people', 'A', 'firstname'],
      ['people', 'B', 'firstname'],
    );
    expect(
      await rgo.query({ name: 'people', fields: ['firstname', 'modifiedat'] }),
    ).toEqual({
      people: [
        { firstname: 'Elissa', modifiedat: timestamp },
        { firstname: null, modifiedat: timestamp },
        { firstname: 'Ena', modifiedat: null },
        { firstname: 'Griffin', modifiedat: null },
        { firstname: null, modifiedat: null },
      ],
    });
  });

  test('delete', async () => {
    const rgo = loadRgo(enhance(resolver));
    rgo.set({ key: ['people', 'A'], value: null });
    await rgo.commit(['people', 'A']);
    expect(
      await rgo.query({ name: 'people', fields: ['firstname', 'modifiedat'] }),
    ).toEqual({
      people: [
        { firstname: 'Delphia', modifiedat: null },
        { firstname: 'Ena', modifiedat: null },
        { firstname: 'Griffin', modifiedat: null },
        { firstname: null, modifiedat: null },
      ],
    });
  });

  test('insert related', async () => {
    const rgo = loadRgo(enhance(resolver));
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
        fields: [
          'firstname',
          { name: 'address', fields: ['city', 'modifiedat'] },
        ],
      }),
    ).toEqual({
      people: [
        {
          firstname: 'Ted',
          address: { city: 'London', modifiedat: timestamp },
        },
        {
          firstname: 'Esperanza',
          address: { city: 'Lynchfurt', modifiedat: null },
        },
        {
          firstname: 'Delphia',
          address: { city: 'Tobyhaven', modifiedat: null },
        },
        { firstname: 'Ena', address: { city: 'Princeview', modifiedat: null } },
        {
          firstname: 'Griffin',
          address: { city: 'Jeannebury', modifiedat: null },
        },
        { firstname: null, address: null },
      ],
    });
  });

  test('insert disallowed', async () => {
    const rgo = loadRgo(enhance(resolver));
    const id = `${newIdPrefix}1`;
    rgo.set({ key: ['people', id, 'lastname'], value: 'Smith' });
    try {
      await rgo.commit(['people', id, 'lastname']);
    } catch (error) {
      expect(error.message).toBe('Not authorized');
    }
  });
});
