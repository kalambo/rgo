import * as fetchMock from 'fetch-mock';
import * as uuid from 'uuid/v1';

import { buildClient, buildServer, Client, connectors } from '../../src';

const baseData = require('./data.json');

const domain = 'https://api.kalambo.org';

export let client: Client;

export const setupClient = async () => {
  const db: any = {};
  const server = await buildServer(
    (_, type) =>
      db[type] ||
      (db[type] = connectors.memory(
        uuid,
        Object.keys(baseData[type || 'schema']).map(id => ({
          id,
          ...baseData[type || 'schema'][id],
        })),
      )),
    () => {},
  );
  fetchMock.post(domain, async (_, opts) => {
    const queries = JSON.parse(opts.body);
    // console.log(JSON.stringify(queries, null, 2));
    const result = await server(queries);
    // console.log(JSON.stringify(result, null, 2));
    return result;
  });
  client = buildClient(domain);
  await client.ready();
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
