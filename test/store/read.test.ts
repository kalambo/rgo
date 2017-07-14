import { keysToObject, Obj } from 'mishmash';
import { parse } from 'graphql';
import * as _ from 'lodash';

import createStore from '../../src/client/store';

const baseData = require('../data.json');
const schema = require('../schema.json');
const store = createStore(schema, baseData);

let data;
const reset = () => (data = _.cloneDeep(baseData));
beforeEach(reset);

const setStore = (value: Obj<Obj<Obj>>) => {
  store.set(value);
  _.merge(data, value);
};
const setCollection = (type: string, value: Obj<Obj>) => {
  store.set(type, value);
  _.merge(data[type], value);
};
const setRecord = (type: string, id: string, value: Obj) => {
  store.set(type, id, value);
  _.merge(data[type][id], value);
};
const setValue = (type: string, id: string, field: string, value: any) => {
  store.set(type, id, field, value);
  _.merge(data[type][id][field], value);
};

describe('store: read', () => {
  test('simple read', () => {
    expect(store.read(parse('{ Person { firstName } }'), {}, null)).toEqual({
      Person: [
        { firstName: 'Esperanza' },
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Griffin' },
        { firstName: null },
      ],
    });
  });
  test('read with id', () => {
    expect(
      store.read(parse('{ Person { id, firstName } }'), {}, null),
    ).toEqual({
      Person: [
        { id: 'A', firstName: 'Esperanza' },
        { id: 'B', firstName: 'Delphia' },
        { id: 'C', firstName: 'Ena' },
        { id: 'D', firstName: 'Griffin' },
        { id: 'E', firstName: null },
      ],
    });
  });
  test('read with non-list relation', () => {
    expect(
      store.read(
        parse('{ Person { firstName, address { id, city } } }'),
        {},
        null,
      ),
    ).toEqual({
      Person: [
        { firstName: 'Esperanza', address: { id: 'A', city: 'Lynchfurt' } },
        { firstName: 'Delphia', address: { id: 'B', city: 'Tobyhaven' } },
        { firstName: 'Ena', address: { id: 'C', city: 'Princeview' } },
        { firstName: 'Griffin', address: { id: 'D', city: 'Jeannebury' } },
        { firstName: null, address: null },
      ],
    });
  });
  test('read with list relation', () => {
    expect(
      store.read(
        parse('{ Person { firstName, places { id, city } } }'),
        {},
        null,
      ),
    ).toEqual({
      Person: [
        {
          firstName: 'Esperanza',
          places: [
            { id: 'A', city: 'Lynchfurt' },
            { id: 'B', city: 'Tobyhaven' },
            { id: 'C', city: 'Princeview' },
          ],
        },
        {
          firstName: 'Delphia',
          places: [
            { id: 'B', city: 'Tobyhaven' },
            { id: 'C', city: 'Princeview' },
            null,
          ],
        },
        {
          firstName: 'Ena',
          places: [
            null,
            { id: 'C', city: 'Princeview' },
            { id: 'D', city: 'Jeannebury' },
          ],
        },
        {
          firstName: 'Griffin',
          places: [{ id: 'D', city: 'Jeannebury' }],
        },
        { firstName: null, places: null },
      ],
    });
  });
  test('read with foreign relation', () => {
    expect(
      store.read(
        parse('{ Address { city, people { id, firstName } } }'),
        {},
        null,
      ),
    ).toEqual({
      Address: [
        {
          city: 'Lynchfurt',
          people: [
            { id: 'A', firstName: 'Esperanza' },
            { id: 'D', firstName: 'Griffin' },
          ],
        },
        {
          city: 'Tobyhaven',
          people: [
            { id: 'A', firstName: 'Esperanza' },
            { id: 'B', firstName: 'Delphia' },
          ],
        },
        {
          city: 'Princeview',
          people: [
            { id: 'A', firstName: 'Esperanza' },
            { id: 'B', firstName: 'Delphia' },
            { id: 'C', firstName: 'Ena' },
          ],
        },
        {
          city: 'Jeannebury',
          people: [
            { id: 'C', firstName: 'Ena' },
            { id: 'D', firstName: 'Griffin' },
          ],
        },
        {
          city: 'Rileyfurt',
          people: null,
        },
      ],
    });
  });
});
