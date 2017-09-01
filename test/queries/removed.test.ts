import {
  clearClient,
  client,
  setupClient,
  relationQuery,
  simpleQuery,
  sortedRelationQuery,
} from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: removed', () => {
  test('simple: 1st', async () => {
    client.set('person', 'B', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 2nd', async () => {
    client.set('person', 'C', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 3rd', async () => {
    client.set('person', 'A', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4th', async () => {
    client.set('person', 'D', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 5th', async () => {
    client.set('person', 'E', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st, 2nd', async () => {
    client.set('person', 'B', null);
    client.set('person', 'C', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 1st, 3rd', async () => {
    client.set('person', 'B', null);
    client.set('person', 'A', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 2nd, 4th', async () => {
    client.set('person', 'C', null);
    client.set('person', 'D', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 1st, 2nd, 4th', async () => {
    client.set('person', 'B', null);
    client.set('person', 'C', null);
    client.set('person', 'D', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: [{ firstname: null, address: null }],
    });
  });
  test('simple: 1st, 2nd, 4th, 5th', async () => {
    client.set('person', 'B', null);
    client.set('person', 'C', null);
    client.set('person', 'D', null);
    client.set('person', 'E', null);
    expect(await client.query(simpleQuery)).toEqual({
      person: null,
    });
  });

  test('relation: 1st', async () => {
    client.set('address', 'B', null);
    expect(await client.query(relationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, null, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('relation: 2nd', async () => {
    client.set('address', 'C', null);
    expect(await client.query(relationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [null, null, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Tobyhaven' }, null],
        },
      ],
    });
  });
  test('relation: 3rd', async () => {
    client.set('address', 'A', null);
    expect(await client.query(relationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [null, { city: 'Tobyhaven' }, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('relation: 4th', async () => {
    client.set('address', 'D', null);
    expect(await client.query(relationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [null, { city: 'Princeview' }, null],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Tobyhaven' },
            { city: 'Princeview' },
          ],
        },
      ],
    });
  });
  test('relation: 5th', async () => {
    client.set('address', 'E', null);
    expect(await client.query(relationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Tobyhaven' },
            { city: 'Princeview' },
          ],
        },
      ],
    });
  });

  test('sorted relation: 1st', async () => {
    client.set('address', 'B', null);
    expect(await client.query(sortedRelationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('sorted relation: 2nd', async () => {
    client.set('address', 'C', null);
    expect(await client.query(sortedRelationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [{ city: 'Jeannebury' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });
  test('sorted relation: 3rd', async () => {
    client.set('address', 'A', null);
    expect(await client.query(sortedRelationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [{ city: 'Princeview' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });
  test('sorted relation: 4th', async () => {
    client.set('address', 'D', null);
    expect(await client.query(sortedRelationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [{ city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Princeview' },
            { city: 'Tobyhaven' },
          ],
        },
      ],
    });
  });
  test('sorted relation: 5th', async () => {
    client.set('address', 'E', null);
    expect(await client.query(sortedRelationQuery)).toEqual({
      person: [
        {
          firstname: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstname: 'Esperanza',
          places: [
            { city: 'Lynchfurt' },
            { city: 'Princeview' },
            { city: 'Tobyhaven' },
          ],
        },
      ],
    });
  });
});
