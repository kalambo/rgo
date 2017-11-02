import { Headers } from 'node-fetch';
(global as any).Headers = Headers;

import * as fetchMock from 'fetch-mock';

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
        () => '',
        Object.keys(baseData.addresses).map(id => ({
          id,
          ...baseData.addresses[id],
        })),
      ),
    },
    people: {
      fields: baseSchema.people,
      connector: connectors.memory(
        () => '',
        Object.keys(baseData.people).map(id => ({
          id,
          ...baseData.people[id],
        })),
      ),
    },
  });
  fetchMock.post(domain, async (_, opts) => {
    const queries = JSON.parse(opts.body);
    const result = await server(queries, {});
    // const introspection = JSON.stringify(queries).includes('Introspection');
    // if (!introspection) {
    //   console.log(JSON.stringify(queries, null, 2));
    //   console.log(JSON.stringify(result, null, 2));
    // }
    return result;
  });
  client = buildClient(domain);
};

export const clearClient = () => {
  fetchMock.restore();
  client = null;
};
