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
};

export const clearClient = () => {
  fetchMock.restore();
  client = null;
};

export const simpleQuery = `{
  Person(sort: "firstName", skip: 1, show: 2) {
    firstName
    address {
      city
    }
  }
}`;

export const relationQuery = `{
  Person(sort: "firstName", skip: 1, show: 2) {
    firstName
    places {
      city
    }
  }
}`;

export const sortedRelationQuery = `{
  Person(sort: "firstName", skip: 1, show: 2) {
    firstName
    places(sort: "city") {
      city
    }
  }
}`;
