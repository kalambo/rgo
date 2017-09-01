import { clearClient, client, setupClient, simpleQuery } from '../setup';

beforeEach(setupClient);
afterEach(clearClient);

describe('queries: modified', () => {
  test('simple: 1st=>0.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Brent');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>1.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Elissa');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>2.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Ernest');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ernest', address: { city: 'Tobyhaven' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 1st=>3.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Faye');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 1st=>4.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 1) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Richie');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 2nd=>0.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Brent');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>1.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Elissa');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Elissa', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>2.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Ernest');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ernest', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 2nd=>3.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Faye');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 1) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Richie');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 3rd=>0.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set('person', 'A', 'firstname', 'Brent');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>1.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set('person', 'A', 'firstname', 'Elissa');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 3rd=>2.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set('person', 'A', 'firstname', 'Ernest');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>3.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set('person', 'A', 'firstname', 'Faye');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Faye', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 3rd=>4.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 2, show: 1) { firstname } }`,
    );
    client.set('person', 'A', 'firstname', 'Richie');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });

  test('simple: 4rd=>0.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set('person', 'D', 'firstname', 'Brent');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>1.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set('person', 'D', 'firstname', 'Elissa');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Elissa', address: { city: 'Jeannebury' } },
        { firstname: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('simple: 4rd=>2.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set('person', 'D', 'firstname', 'Ernest');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Ernest', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('simple: 4rd=>3.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set('person', 'D', 'firstname', 'Faye');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('simple: 4rd=>4.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 3, show: 1) { firstname } }`,
    );
    client.set('person', 'D', 'firstname', 'Richie');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Ena', address: { city: 'Princeview' } },
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('simple: 1st=>3.5th, 2nd => 0.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 0, show: 2) { firstname } }`,
    );
    client.set('person', 'B', 'firstname', 'Faye');
    client.set('person', 'C', 'firstname', 'Brent');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstname: 'Faye', address: { city: 'Tobyhaven' } },
      ],
    });
  });
  test('simple: 2nd=>4.5th, 3rd => 1.5th', async () => {
    await client.query(
      `{ person(sort: "firstname", skip: 1, show: 2) { firstname } }`,
    );
    client.set('person', 'C', 'firstname', 'Richie');
    client.set('person', 'A', 'firstname', 'Elissa');
    expect(await client.query(simpleQuery)).toEqual({
      person: [
        { firstname: 'Elissa', address: { city: 'Lynchfurt' } },
        { firstname: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
});
