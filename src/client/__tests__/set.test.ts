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
      address: { A: null, F: { city: 'Troyville' } },
    });
    delete expected.server.address.A;
    expected.server.address.F = { city: 'Troyville' };
    delete expected.combined.address.A;
    expected.combined.address.F = { city: 'Troyville' };

    expect(state).toEqual(expected);
    expect(changes2).toEqual({
      address: {
        A: { street: true, city: true, zipcode: true, people: true },
        F: { city: true },
      },
    });

    const changes3 = setClient(state, [
      {
        address: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
        person: { A: null },
      },
    ]);
    expected.client = {
      address: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
      person: { A: null },
    };
    expected.combined.address.A = { city: 'Torpchester' };
    expected.combined.address.B.city = 'Homenickstad';
    delete expected.combined.person.A;
    expected.diff = { address: { A: 1, B: 0 }, person: { A: -1 } };

    expect(state).toEqual(expected);
    expect(changes3).toEqual({
      address: { A: { city: true }, B: { city: true } },
      person: {
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
