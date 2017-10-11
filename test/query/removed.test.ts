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

describe('query: removed', () => {
  test('simple: 1st', async () => {
    client.set([{ key: ['people', 'B'], value: null }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 2nd', async () => {
    client.set([{ key: ['people', 'C'], value: null }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 3rd', async () => {
    client.set([{ key: ['people', 'A'], value: null }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4th', async () => {
    client.set([{ key: ['people', 'D'], value: null }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 5th', async () => {
    client.set([{ key: ['people', 'E'], value: null }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st, 2nd', async () => {
    client.set([
      { key: ['people', 'B'], value: null },
      { key: ['people', 'C'], value: null },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 1st, 3rd', async () => {
    client.set([
      { key: ['people', 'B'], value: null },
      { key: ['people', 'A'], value: null },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 2nd, 4th', async () => {
    client.set([
      { key: ['people', 'C'], value: null },
      { key: ['people', 'D'], value: null },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: null, address: null },
      ],
    });
  });
  test('simple: 1st, 2nd, 4th', async () => {
    client.set([
      { key: ['people', 'B'], value: null },
      { key: ['people', 'C'], value: null },
      { key: ['people', 'D'], value: null },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [{ firstname: null, address: null }],
    });
  });
  test('simple: 1st, 2nd, 4th, 5th', async () => {
    client.set([
      { key: ['people', 'B'], value: null },
      { key: ['people', 'C'], value: null },
      { key: ['people', 'D'], value: null },
      { key: ['people', 'E'], value: null },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [],
    });
  });

  test('relation: 1st', async () => {
    client.set([{ key: ['addresses', 'B'], value: null }]);
    expect(await client.query(relationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'C'], value: null }]);
    expect(await client.query(relationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'A'], value: null }]);
    expect(await client.query(relationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'D'], value: null }]);
    expect(await client.query(relationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'E'], value: null }]);
    expect(await client.query(relationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'B'], value: null }]);
    expect(await client.query(sortedRelationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'C'], value: null }]);
    expect(await client.query(sortedRelationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'A'], value: null }]);
    expect(await client.query(sortedRelationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'D'], value: null }]);
    expect(await client.query(sortedRelationQuery)).toEqual({
      people: [
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
    client.set([{ key: ['addresses', 'E'], value: null }]);
    expect(await client.query(sortedRelationQuery)).toEqual({
      people: [
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
