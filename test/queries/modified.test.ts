import { clearClient, client, setupClient, simpleQuery } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: modified', () => {
  test('simple: 1st=>0.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'B', 'firstname'], value: 'Brent' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>1.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'B', 'firstname'], value: 'Elissa' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>2.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'B', 'firstname'], value: 'Ernest' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ernest', address: { city: 'Tobyhaven' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>3.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'B', 'firstname'], value: 'Faye' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 1st=>4.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'B', 'firstname'], value: 'Richie' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 2nd=>0.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'C', 'firstname'], value: 'Brent' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>1.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'C', 'firstname'], value: 'Elissa' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Elissa', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>2.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'C', 'firstname'], value: 'Ernest' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ernest', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>3.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'C', 'firstname'], value: 'Faye' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'C', 'firstname'], value: 'Richie' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 3rd=>0.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Brent' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>1.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Elissa' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>2.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Ernest' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>3.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Faye' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Faye', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>4.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'A', 'firstname'], value: 'Richie' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 4rd=>0.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'D', 'firstname'], value: 'Brent' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>1.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'D', 'firstname'], value: 'Elissa' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Elissa', address: { city: 'Jeannebury' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>2.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'D', 'firstname'], value: 'Ernest' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4rd=>3.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'D', 'firstname'], value: 'Faye' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4rd=>4.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set([{ key: ['people', 'D', 'firstname'], value: 'Richie' }]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('simple: 1st=>3.5th, 2nd => 0.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 0, show: 2) { firstname } }`,
    );
    client.set([
      { key: ['people', 'B', 'firstname'], value: 'Faye' },
      { key: ['people', 'C', 'firstname'], value: 'Brent' },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th, 3rd => 1.5th', async () => {
    await client.query(
      `{ people(sort: "firstname", skip: 1, show: 2) { firstname } }`,
    );
    client.set([
      { key: ['people', 'C', 'firstname'], value: 'Richie' },
      { key: ['people', 'A', 'firstname'], value: 'Elissa' },
    ]);
    expect(await client.query(simpleQuery)).toEqual({
      people: [
        { firstname: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
});
