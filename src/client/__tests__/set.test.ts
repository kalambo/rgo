import * as _ from 'lodash';

import { setClient, setServer } from '../set';
import { ClientState } from '../typings';

const baseData = require('./setup/data.json');

describe('client: set', () => {
  test('basic', () => {
    const state: ClientState = {
      server: {},
      client: {},
      combined: {},
      diff: {},
    };
    const expected: ClientState = _.cloneDeep(state);

    const changes1 = setServer(state, baseData);
    expected.server = _.cloneDeep(baseData);
    expected.combined = _.cloneDeep(baseData);

    expect(state).toEqual(expected);
    expect(changes1).toEqual(
      _.mapValues(baseData, collection =>
        _.mapValues(collection, record => _.mapValues(record, () => true)),
      ),
    );

    const changes2 = setServer(state, {
      Address: { A: null, F: { city: 'Troyville' } },
    });
    delete expected.server.Address.A;
    expected.server.Address.F = { city: 'Troyville' };
    delete expected.combined.Address.A;
    expected.combined.Address.F = { city: 'Troyville' };

    expect(state).toEqual(expected);
    expect(changes2).toEqual({
      Address: {
        A: { street: true, city: true, postcode: true, people: true },
        F: { city: true },
      },
    });

    const changes3 = setClient(state, [
      {
        Address: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
        Person: { A: null },
      },
    ]);
    expected.client = {
      Address: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
      Person: { A: null },
    };
    expected.combined.Address.A = { city: 'Torpchester' };
    expected.combined.Address.B.city = 'Homenickstad';
    delete expected.combined.Person.A;
    expected.diff = { Address: { A: 1, B: 0 }, Person: { A: -1 } };

    expect(state).toEqual(expected);
    expect(changes3).toEqual({
      Address: { A: { city: true }, B: { city: true } },
      Person: {
        A: {
          firstName: true,
          lastName: true,
          email: true,
          address: true,
          places: true,
        },
      },
    });
  });
});
