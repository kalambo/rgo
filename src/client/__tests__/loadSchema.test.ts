import * as fetchMock from 'fetch-mock';

import loadSchema from '../loadSchema';

const baseSchema = require('./setup/schema.json');

fetchMock.post('https://api.kalambo.org', {
  data: { SCHEMA: JSON.stringify(baseSchema) },
});

describe('client: loadSchema', () => {
  test('basic', async () => {
    const { schema, normalize } = await loadSchema('https://api.kalambo.org');

    expect(schema).toEqual(baseSchema);
    expect(
      normalize({
        Person: [
          {
            id: 'A',
            firstName: 'Cierra',
            address: { id: 'C', city: 'Colechester' },
          },
          { id: 'B', firstName: 'Kaley' },
        ],
      }),
    ).toEqual({
      Person: {
        A: { firstName: 'Cierra', address: 'C' },
        B: { firstName: 'Kaley' },
      },
      Address: { C: { city: 'Colechester' } },
    });
  });
});
