import { Headers } from 'node-fetch';
(global as any).Headers = Headers;

import * as fetchMock from 'fetch-mock';

import { buildClient, buildServer, Client, sources } from '../../src';

const baseData = require('./data.json');
const baseSchema = require('./schema.json');

export let client: Client;

export const setupClient = async () => {
  const db: any = {};
  const server = await buildServer({
    addresses: {
      schema: baseSchema.addresses,
      source: sources.memory(
        () => '',
        Object.keys(baseData.addresses).map(id => ({
          id,
          ...baseData.addresses[id],
        })),
      ),
    },
    people: {
      schema: baseSchema.people,
      source: sources.memory(
        () => '',
        Object.keys(baseData.people).map(id => ({
          id,
          ...baseData.people[id],
        })),
      ),
    },
  });
  fetchMock.post('https://www.example.com', async (_, opts) => {
    const request = JSON.parse(opts.body);
    const response = await server(request, {});
    // console.log(JSON.stringify(request, null, 2));
    // console.log(JSON.stringify(response, null, 2));
    return response;
  });
  client = buildClient(baseSchema, 'https://www.example.com');
};

export const clearClient = () => {
  fetchMock.restore();
  client = null;
};
