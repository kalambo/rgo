import * as _ from 'lodash';

import ClientState from '../ClientState';

const baseData = require('./setup/data.json');
const baseSchema = require('./setup/schema.json');

describe('client: set', () => {
  test('basic', () => {
    const state = new ClientState([]);
    const resultsList: any[] = [];
    const changesList: any[] = [];
    const expected = _.cloneDeep({
      server: state.server,
      client: state.client,
      combined: state.combined,
      diff: state.diff,
    });

    let count = 0;
    state.listen(({ changes }) => {
      expect({
        server: state.server,
        client: state.client,
        combined: state.combined,
        diff: state.diff,
      }).toEqual(resultsList[count]);
      expect(changes).toEqual(changesList[count]);
      count++;
    });

    expected.server = _.cloneDeep(baseData);
    expected.combined = _.cloneDeep(baseData);
    expected.diff = { people: {}, addresses: {} };

    resultsList.push(_.cloneDeep(expected));
    changesList.push(
      _.cloneDeep(
        _.mapValues(baseData, collection =>
          _.mapValues(collection, record =>
            Object.keys(record)
              .filter(k => record[k] !== null)
              .reduce((res, k) => ({ ...res, [k]: true }), {}),
          ),
        ),
      ),
    );
    state.setServer(baseData, baseSchema);

    delete expected.server.addresses.A;
    expected.server.addresses.F = { city: 'Troyville' };
    delete expected.combined.addresses.A;
    expected.combined.addresses.F = { city: 'Troyville' };

    resultsList.push(_.cloneDeep(expected));
    changesList.push({
      addresses: {
        A: { street: true, city: true, zipcode: true, people: true },
        F: { city: true },
      },
    });
    state.setServer(
      { addresses: { A: null, F: { city: 'Troyville' } } },
      baseSchema,
    );

    expected.client = {
      addresses: { A: { city: 'Torpchester' }, B: { city: 'Homenickstad' } },
      people: { A: null },
    };
    expected.combined.addresses.A = { city: 'Torpchester' };
    expected.combined.addresses.B.city = 'Homenickstad';
    delete expected.combined.people.A;
    expected.diff = { addresses: { A: 1, B: 0 }, people: { A: -1 } };

    resultsList.push(_.cloneDeep(expected));
    changesList.push({
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
    state.setClient([
      { key: ['addresses', 'A', 'city'], value: 'Torpchester' },
      { key: ['addresses', 'B', 'city'], value: 'Homenickstad' },
      { key: ['people', 'A'], value: null },
    ]);
  });
});
