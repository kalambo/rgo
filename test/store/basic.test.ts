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

describe('store: basic', () => {
  test('get store', () => {
    expect(store.get()).toEqual(data);
  });
  test('get collection', () => {
    expect(store.get('Person')).toEqual(data.Person);
  });
  test('get record', () => {
    expect(store.get('Person', 'A')).toEqual(data.Person.A);
  });
  test('get value', () => {
    expect(store.get('Person', 'A', 'email')).toEqual(data.Person.A.email);
  });

  test('set store', () => {
    setStore({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    expect(store.get()).toEqual(data);
  });
  test('set collection', () => {
    setCollection('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    expect(store.get()).toEqual(data);
  });
  test('set record', () => {
    setRecord('Person', 'A', { firstName: '1' });
    expect(store.get()).toEqual(data);
  });
  test('set value', () => {
    setValue('Person', 'A', 'firstName', '1');
    expect(store.get()).toEqual(data);
  });

  test('set server', () => {
    const value = {
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    };
    store.setServer(value);
    _.merge(data, value);
    expect(store.get()).toEqual(data);
  });

  test('watch store and set store', () => {
    let result;
    store.get(v => (result = v));
    setStore({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    expect(result).toEqual(data);
  });
  test('watch store and set collection', () => {
    let result;
    store.get(v => (result = v));
    setCollection('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    expect(result).toEqual(data);
  });
  test('watch store and set record', () => {
    let result;
    store.get(v => (result = v));
    setRecord('Person', 'A', { firstName: '1' });
    expect(result).toEqual(data);
  });
  test('watch store and set value', () => {
    let result;
    store.get(v => (result = v));
    setValue('Person', 'A', 'firstName', '1');
    expect(result).toEqual(data);
  });

  test('watch collection and set store', () => {
    let result;
    store.get('Person', v => (result = v));
    setStore({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    expect(result).toEqual(data.Person);
  });
  test('watch collection and set collection', () => {
    let result;
    store.get('Person', v => (result = v));
    setCollection('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    expect(result).toEqual(data.Person);
  });
  test('watch collection and set record', () => {
    let result;
    store.get('Person', v => (result = v));
    setRecord('Person', 'A', { firstName: '1' });
    expect(result).toEqual(data.Person);
  });
  test('watch collection and set value', () => {
    let result;
    store.get('Person', v => (result = v));
    setValue('Person', 'A', 'firstName', '1');
    expect(result).toEqual(data.Person);
  });

  test('watch record and set store', () => {
    let result;
    store.get('Person', 'A', v => (result = v));
    setStore({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    expect(result).toEqual(data.Person.A);
  });
  test('watch record and set collection', () => {
    let result;
    store.get('Person', 'A', v => (result = v));
    setCollection('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    expect(result).toEqual(data.Person.A);
  });
  test('watch record and set record', () => {
    let result;
    store.get('Person', 'A', v => (result = v));
    setRecord('Person', 'A', { firstName: '1' });
    expect(result).toEqual(data.Person.A);
  });
  test('watch record and set value', () => {
    let result;
    store.get('Person', 'A', v => (result = v));
    setValue('Person', 'A', 'firstName', '1');
    expect(result).toEqual(data.Person.A);
  });

  test('watch value and set store', () => {
    let result;
    store.get('Person', 'A', 'firstName', v => (result = v));
    setStore({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    expect(result).toEqual(data.Person.A.firstName);
  });
  test('watch value and set collection', () => {
    let result;
    store.get('Person', 'A', 'firstName', v => (result = v));
    setCollection('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    expect(result).toEqual(data.Person.A.firstName);
  });
  test('watch value and set record', () => {
    let result;
    store.get('Person', 'A', 'firstName', v => (result = v));
    setRecord('Person', 'A', { firstName: '1' });
    expect(result).toEqual(data.Person.A.firstName);
  });
  test('watch value and set value', () => {
    let result;
    store.get('Person', 'A', 'firstName', v => (result = v));
    setValue('Person', 'A', 'firstName', '1');
    expect(result).toEqual(data.Person.A.firstName);
  });
});
