import { parse } from 'graphql';
import * as _ from 'lodash';

import createStore from '../../../src/client/store';

const baseData = require('../../data.json');
const schema = require('../../schema.json');

let data;
const reset = () => {
  data = _.cloneDeep(baseData);
};
beforeEach(reset);

describe('store: read watch', () => {
  test('read with set', () => {
    const store = createStore(schema, { client: data });
    let result;
    const unsubscribe = store.read(
      parse('{ Person { firstName } }'),
      {},
      null,
      v => (result = v),
    );

    store.set('Person', 'A', 'firstName', '1');
    expect(result).toEqual({
      Person: [
        { firstName: '1' },
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Griffin' },
        { firstName: null },
      ],
    });

    store.set('Person', 'F', { firstName: 'Steve' });
    expect(result).toEqual({
      Person: [
        { firstName: '1' },
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Griffin' },
        { firstName: null },
        { firstName: 'Steve' },
      ],
    });

    store.set('Person', 'A', 'firstName', undefined);
    expect(result).toEqual({
      Person: [
        { firstName: undefined },
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Griffin' },
        { firstName: null },
        { firstName: 'Steve' },
      ],
    });

    store.set('Person', 'A', undefined);
    expect(result).toEqual({
      Person: [
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Griffin' },
        { firstName: null },
        { firstName: 'Steve' },
      ],
    });

    store.set('Person', undefined);
    expect(result).toEqual({ Person: [] });
  });
});
