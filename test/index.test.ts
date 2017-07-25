import uuid from 'uuid/v1';
import * as fetchMock from 'fetch-mock';

import { buildClient, buildServer, Client, connectors } from '../src';

const baseData = require('./setup/data.json');

const domain = 'https://api.kalambo.org';

const authFetch = async (url: string, body: any[]) =>
  await (await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

let client: Client;
beforeEach(async () => {
  const server = buildServer({
    Address: {
      fields: {
        street: { scalar: 'String' },
        city: { scalar: 'String' },
        zipCode: { scalar: 'String' },
        people: { type: 'Person', foreign: 'places' },
      },
      connector: connectors.memory(
        Object.keys(baseData.Address).map(id => ({
          id,
          ...baseData.Address[id],
        })),
      ),
      newId: () => uuid(),
      auth: {},
    },
    Person: {
      fields: {
        firstName: { scalar: 'String' },
        lastName: { scalar: 'String' },
        email: { scalar: 'String' },
        address: { type: 'Address' },
        places: { type: 'Address', isList: true },
      },
      connector: connectors.memory(
        Object.keys(baseData.Person).map(id => ({
          id,
          ...baseData.Person[id],
        })),
      ),
      newId: () => uuid(),
      auth: {},
    },
  });
  fetchMock.post(domain, async (_, opts) => {
    const queries = JSON.parse(opts.body);
    // console.log(JSON.stringify(queries, null, 2));
    const result = await server(queries);
    // console.log(JSON.stringify(result, null, 2));
    return result;
  });
  client = await buildClient(domain, authFetch);
});
afterEach(() => {
  fetchMock.restore();
  client = null;
});

describe('end to end', () => {
  test('basic', async () => {
    expect(
      await client.query(
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
      ),
    ).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });

  const sliceQuery = `{
    Person(sort: "firstName", skip: 1, show: 2) {
      firstName
      address {
        city
      }
    }
  }`;

  test('slice', async () => {
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });

  test('slice with added: 0.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('slice with added: 1.5th', async () => {
    client.set('Person', 'F', { firstName: 'Elissa' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Elissa', address: null },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('slice with added: 2.5th', async () => {
    client.set('Person', 'F', { firstName: 'Ernest' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Ernest', address: null },
      ],
    });
  });
  test('slice with added: 3.5th', async () => {
    client.set('Person', 'F', { firstName: 'Faye' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('slice with added: 4.5th', async () => {
    client.set('Person', 'F', { firstName: 'Richie' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('slice with added: 0.5th, 1.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Elissa' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Elissa', address: null },
      ],
    });
  });
  test('slice with added: 0.5th, 2.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Ernest' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { city: 'Princeview' } },
      ],
    });
  });
  test('slice with added: 0.5th, 2.5th, 3.5th', async () => {
    client.set('Person', 'F', { firstName: 'Brent' });
    client.set('Person', 'G', { firstName: 'Elissa' });
    client.set('Person', 'H', { firstName: 'Faye' });
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Delphia', address: { city: 'Tobyhaven' } },
        { firstName: 'Elissa', address: null },
      ],
    });
  });

  test('slice with removed: 1st', async () => {
    client.set('Person', 'B', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('slice with removed: 2nd', async () => {
    client.set('Person', 'C', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('slice with removed: 3rd', async () => {
    client.set('Person', 'A', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
      ],
    });
  });
  test('slice with removed: 4th', async () => {
    client.set('Person', 'D', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('slice with removed: 5th', async () => {
    client.set('Person', 'E', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Ena', address: { city: 'Princeview' } },
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
      ],
    });
  });
  test('slice with removed: 1st, 2nd', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('slice with removed: 1st, 3rd', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'A', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Griffin', address: { city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('slice with removed: 2nd, 4th', async () => {
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { city: 'Lynchfurt' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('slice with removed: 1st, 2nd, 4th', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({
      Person: [{ firstName: null, address: null }],
    });
  });
  test('slice with removed: 1st, 2nd, 4th, 5th', async () => {
    client.set('Person', 'B', null);
    client.set('Person', 'C', null);
    client.set('Person', 'D', null);
    client.set('Person', 'E', null);
    expect(await client.query(sliceQuery, {}, false)).toEqual({ Person: null });
  });
});
