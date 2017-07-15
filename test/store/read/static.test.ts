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

describe('store: read static', () => {
  test('read', () => {
    const store = createStore(schema, { client: data });
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
    const store = createStore(schema, { client: data });
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
  test('read with filter', () => {
    const store = createStore(schema, { client: data });
    expect(
      store.read(
        parse('{ Person(filter:"firstName=Ena") { firstName } }'),
        {},
        null,
      ),
    ).toEqual({
      Person: [{ firstName: 'Ena' }],
    });
  });
  test('read with sort', () => {
    const store = createStore(schema, { client: data });
    expect(
      store.read(parse('{ Person(sort:"firstName") { firstName } }'), {}, null),
    ).toEqual({
      Person: [
        { firstName: 'Delphia' },
        { firstName: 'Ena' },
        { firstName: 'Esperanza' },
        { firstName: 'Griffin' },
        { firstName: null },
      ],
    });
  });
  test('read with reverse id sort', () => {
    const store = createStore(schema, { client: data });
    expect(
      store.read(parse('{ Person(sort:"-id") { firstName } }'), {}, null),
    ).toEqual({
      Person: [
        { firstName: null },
        { firstName: 'Griffin' },
        { firstName: 'Ena' },
        { firstName: 'Delphia' },
        { firstName: 'Esperanza' },
      ],
    });
  });
  test('read with slice', () => {
    const store = createStore(schema, { client: data });
    expect(
      store.read(parse('{ Person(skip: 1, show: 2) { firstName } }'), {}, null),
    ).toEqual({
      Person: [{ firstName: 'Delphia' }, { firstName: 'Ena' }],
    });
  });
  test('read undefined', () => {
    const store = createStore(schema, { client: data });
    expect(store.read(parse('{ U { firstName } }'), {}, null)).toEqual({
      U: null,
    });
  });
  test('read with non-list relation', () => {
    const store = createStore(schema, { client: data });
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
    const store = createStore(schema, { client: data });
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
    const store = createStore(schema, { client: data });
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
