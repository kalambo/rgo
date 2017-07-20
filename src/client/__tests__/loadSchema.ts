import * as fetchMock from 'fetch-mock';

import loadSchema from '../loadSchema';

const baseSchema = require('./setup/schema.json');

fetchMock.post('https://api.kalambo.org', {
  data: { SCHEMA: JSON.stringify(baseSchema) },
});

describe('loadSchema', () => {
  test('basic', async () => {
    const { schema, normalize } = await loadSchema('https://api.kalambo.org');

    expect(schema).toEqual(baseSchema);
    expect(
      normalize({
        Person: [
          { id: 'A', firstName: 'Dave', address: { id: 'C', city: 'London' } },
          { id: 'B', firstName: 'Tom' },
        ],
      }),
    ).toEqual({
      Person: {
        A: { firstName: 'Dave', address: 'C' },
        B: { firstName: 'Tom' },
      },
      Address: { C: { city: 'London' } },
    });
  });
});
