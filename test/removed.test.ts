import {
  clearClient,
  client,
  setupClient,
  relationQuery,
  simpleQuery,
  sortedRelationQuery,
} from './setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('end to end: removed', () => {
  test('simple: 1st', async () => {
    client.set('Person', 'B', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 2nd', async () => {
    client.set('Person', 'C', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 3rd', async () => {
    client.set('Person', 'A', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4th', async () => {
    client.set('Person', 'D', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 5th', async () => {
    client.set('Person', 'E', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st, 2nd', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('simple: 1st, 3rd', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'A', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('simple: 2nd, 4th', async () => {
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('simple: 1st, 2nd, 4th', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [{ firstName: null, address: null }],
    });
  });
  test('simple: 1st, 2nd, 4th, 5th', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    client.set('Person', 'E', null);
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: null,
    });
  });

  test('relation: 1st', async () => {
    client.set('Address', 'B', null);
    expect(await client.query(relationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstName: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, null, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('relation: 2nd', async () => {
    client.set('Address', 'C', null);
    expect(await client.query(relationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [null, null, { city: 'Jeannebury' }],
        },
        {
          firstName: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Tobyhaven' }, null],
        },
      ],
    });
  });
  test('relation: 3rd', async () => {
    client.set('Address', 'A', null);
    expect(await client.query(relationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstName: 'Esperanza',
          places: [null, { city: 'Tobyhaven' }, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('relation: 4th', async () => {
    client.set('Address', 'D', null);
    expect(await client.query(relationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [null, { city: 'Princeview' }, null],
        },
        {
          firstName: 'Esperanza',
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
    client.set('Address', 'E', null);
    expect(await client.query(relationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [null, { city: 'Princeview' }, { city: 'Jeannebury' }],
        },
        {
          firstName: 'Esperanza',
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
    client.set('Address', 'B', null);
    expect(await client.query(sortedRelationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstName: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Princeview' }],
        },
      ],
    });
  });
  test('sorted relation: 2nd', async () => {
    client.set('Address', 'C', null);
    expect(await client.query(sortedRelationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [{ city: 'Jeannebury' }],
        },
        {
          firstName: 'Esperanza',
          places: [{ city: 'Lynchfurt' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });
  test('sorted relation: 3rd', async () => {
    client.set('Address', 'A', null);
    expect(await client.query(sortedRelationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstName: 'Esperanza',
          places: [{ city: 'Princeview' }, { city: 'Tobyhaven' }],
        },
      ],
    });
  });
  test('sorted relation: 4th', async () => {
    client.set('Address', 'D', null);
    expect(await client.query(sortedRelationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [{ city: 'Princeview' }],
        },
        {
          firstName: 'Esperanza',
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
    client.set('Address', 'E', null);
    expect(await client.query(sortedRelationQuery, {}, false)).toEqual({
      Person: [
        {
          firstName: 'Ena',
          places: [{ city: 'Jeannebury' }, { city: 'Princeview' }],
        },
        {
          firstName: 'Esperanza',
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
