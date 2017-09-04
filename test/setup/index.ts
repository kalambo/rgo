import uuid from 'uuid/v1';
import * as fetchMock from 'fetch-mock';

import { buildClient, buildServer, Client, connectors } from '../../src';

const baseData = require('./data.json');

const domain = 'https://api.kalambo.org';

export let client: Client;

const authFetch = async (url: string, body: any[]) =>
  await (await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

export const setupClient = async () => {
  const server = buildServer({
    addresses: {
      fields: {
        street: { scalar: 'string' },
        city: { scalar: 'string' },
        zipcode: { scalar: 'string' },
        people: { type: 'people', foreign: 'places' },
      },
      connector: connectors.memory(
        Object.keys(baseData.addresses).map(id => ({
          id,
          ...baseData.addresses[id],
        })),
      ),
      newId: () => uuid(),
      auth: {},
    },
    people: {
      fields: {
        firstname: { scalar: 'string' },
        lastname: { scalar: 'string' },
        email: { scalar: 'string' },
        address: { type: 'addresses' },
        places: { type: 'addresses', isList: true },
      },
      connector: connectors.memory(
        Object.keys(baseData.people).map(id => ({
          id,
          ...baseData.people[id],
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
};

export const clearClient = () => {
  fetchMock.restore();
  client = null;
};

export const simpleQuery = `{
  people(sort: "firstname", skip: 1, show: 2) {
    firstname
    address {
      city
    }
  }
}`;

export const relationQuery = `{
  people(sort: "firstname", skip: 1, show: 2) {
    firstname
    places {
      city
    }
  }
}`;

export const sortedRelationQuery = `{
  people(sort: "firstname", skip: 1, show: 2) {
    firstname
    places(sort: "city") {
      city
    }
  }
}`;
