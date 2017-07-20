import * as fetchMock from 'fetch-mock';
import { Obj } from 'mishmash';

import buildClient from '../index';

const baseSchema = require('./setup/schema.json');

const domain = 'https://api.kalambo.org';

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();
const cleanRequests = (body: { query: string; variables: Obj }[]) =>
  body.map(({ query, variables }) => ({ query: clean(query), variables }));

const authFetch = async (url: string, body: any[]) =>
  await (await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();

fetchMock.postOnce(domain, {
  data: { SCHEMA: JSON.stringify(baseSchema) },
});
fetchMock.postOnce(domain, [
  {
    data: {
      Person: [
        {
          id: 'A',
          firstName: 'Cierra',
          address: { id: 'C', city: 'Colechester' },
        },
        { id: 'B', firstName: 'Kaley' },
      ],
    },
  },
]);

describe('client: index', () => {
  test('basic', async () => {
    const client = await buildClient(domain, authFetch);

    const result1 = await client.query(
      `{
        Person {
          firstName
          address {
            city
          }
        }
      }`,
      {},
      false,
    );

    expect(
      cleanRequests(JSON.parse(fetchMock.lastOptions(domain).body)),
    ).toEqual([
      {
        query: clean(`{
          Person(extra: $Person) {
            firstName
            address(extra: $Person_address) {
              city
              id
              createdAt
            }
            id
            createdAt
          }
        }`),
        variables: {
          Person: { skip: 0, show: 0 },
          Person_address: { skip: 0, show: 0 },
        },
      },
    ]);
    expect(result1).toEqual({
      Person: [
        { firstName: 'Cierra', address: { city: 'Colechester' } },
        { firstName: 'Kaley', address: null },
      ],
    });
    expect(client.get()).toEqual({
      Address: { C: { city: 'Colechester' } },
      Person: {
        A: { firstName: 'Cierra', address: 'C' },
        B: { firstName: 'Kaley' },
      },
    });
  });
});
