import * as _ from 'lodash';

import { setClient, setServer } from '../set';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

describe('client: set', () => {
  test('basic', () => {
    const state: ClientState = {
      server: {},
      client: {},
      combined: {},
      diff: {},
    };
    const expected: ClientState = _.cloneDeep(state);

    const changes1 = setServer(baseSchema, state, baseData);
    expected.server = _.cloneDeep(baseData);
    expected.combined = _.cloneDeep(baseData);

    expect(state).toEqual(expected);
    expect(changes1).toEqual(
      _.mapValues(baseData, collection =>
        _.mapValues(collection, record => _.mapValues(record, () => true)),
      ),
    );

    const changes2 = setServer(baseSchema, state, {
      addresses: { A: null, F: { city: 'Troyville' } },
    });
    delete expected.server.addresses.A;
    expected.server.addresses.F = { city: 'Troyville' };
    delete expected.combined.addresses.A;
    expected.combined.addresses.F = { city: 'Troyville' };

    expect(state).toEqual(expected);
    expect(changes2).toEqual({
      addresses: {
        A: { street: true, city: true, zipcode: true, people: true },
        F: { city: true },
      },
    });

    const changes3 = setClient(state, [
      {
        addresses: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
        people: { A: null },
      },
    ]);
    expected.client = {
      addresses: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
      people: { A: null },
    };
    expected.combined.addresses.A = { city: 'Torpchester' };
    expected.combined.addresses.B.city = 'Homenickstad';
    delete expected.combined.people.A;
    expected.diff = { addresses: { A: 1, B: 0 }, people: { A: -1 } };

    expect(state).toEqual(expected);
    expect(changes3).toEqual({
      addresses: { A: { city: true }, B: { city: true } },
      people: {
        A: {
          firstname: true,
          lastname: true,
          email: true,
          address: true,
          places: true,
        },
      },
    });
  });
});
