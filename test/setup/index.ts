import * as fetchMock from 'fetch-mock';
import * as uuid from 'uuid/v1';

import { buildClient, buildServer, Client, connectors } from '../../src';

const baseData = require('./data.json');
const baseSchema = require('./schema.json');

const domain = 'https://api.kalambo.org';

export let client: Client;

export const setupClient = async () => {
  const db: any = {};
  const server = await buildServer({
    addresses: {
      fields: baseSchema.addresses,
      connector: connectors.memory(
        uuid,
        Object.keys(baseData.addresses).map(id => ({
          id,
          ...baseData.addresses[id],
        })),
      ),
    },
    people: {
      fields: baseSchema.people,
      connector: connectors.memory(
        uuid,
        Object.keys(baseData.people).map(id => ({
          id,
          ...baseData.people[id],
        })),
      ),
    },
  });
  fetchMock.post(domain, async (_, opts) => {
    const queries = JSON.parse(opts.body);
    // console.log(JSON.stringify(queries, null, 2));
    const result = await server(queries);
    // console.log(JSON.stringify(result, null, 2));
    return result;
  });
  client = buildClient(domain);
};

export const clearClient = () => {
  fetchMock.restore();
  client = null;
};

export const simpleQuery = `{
  people(sort: "firstname", start: 1, end: 3) {
    firstname
    address {
      city
    }
  }
}`;

export const relationQuery = `{
  people(sort: "firstname", start: 1, end: 3) {
    firstname
    places {
      city
    }
  }
}`;

export const sortedRelationQuery = `{
  people(sort: "firstname", start: 1, end: 3) {
    firstname
    places(sort: "city") {
      city
    }
  }
}`;
