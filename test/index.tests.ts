import { buildSchema, connectors } from '../src/server';

const baseData = require('./setup/data.json');

describe('end to end', () => {
  test('basic', () => {
    const schema = buildSchema({
      Address: {
        fields: {
          street: { scalar: 'String' },
          city: { scalar: 'String' },
          zipCode: { scalar: 'String' },
          people: { type: 'Person', foreign: 'places' },
        },
        connector: connectors.memory(baseData.Address),
        newId: () => 'A',
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
        connector: connectors.memory(baseData.Person),
        newId: () => 'A',
        auth: {},
      },
    });
  });
});
