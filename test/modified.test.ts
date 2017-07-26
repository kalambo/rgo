import { clearClient, client, setupClient, simpleQuery } from './setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('end to end: modified', () => {
  test('simple: 1st=>0.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Brent');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>1.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Elissa');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>2.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Ernest');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ernest', address: { city: 'Tobyhaven' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>3.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Faye');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 1st=>4.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Richie');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 2nd=>0.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Brent');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>1.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Elissa');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Elissa', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>2.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Ernest');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ernest', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>3.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Faye');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Faye', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Richie');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 3rd=>0.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 2, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'A', 'firstName', 'Brent');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>1.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 2, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'A', 'firstName', 'Elissa');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>2.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 2, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'A', 'firstName', 'Ernest');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Ernest', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>3.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 2, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'A', 'firstName', 'Faye');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Faye', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>4.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 2, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'A', 'firstName', 'Richie');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 4rd=>0.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 3, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'D', 'firstName', 'Brent');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>1.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 3, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'D', 'firstName', 'Elissa');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Elissa', address: { city: 'Jeannebury' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>2.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 3, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'D', 'firstName', 'Ernest');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Ernest', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4rd=>3.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 3, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'D', 'firstName', 'Faye');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4rd=>4.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 3, show: 1) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'D', 'firstName', 'Richie');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('simple: 1st=>3.5th, 2nd => 0.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 0, show: 2) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'B', 'firstName', 'Faye');
    client.set('Person', 'C', 'firstName', 'Brent');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th, 3rd => 1.5th', async () => {
    await client.query(
      `{ Person(sort: "firstName", skip: 1, show: 2) { firstName } }`,
      {},
      false,
    );
    client.set('Person', 'C', 'firstName', 'Richie');
    client.set('Person', 'A', 'firstName', 'Elissa');
    expect(await client.query(simpleQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
});
