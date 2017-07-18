import * as _ from 'lodash';

import createStore from '../../src/client/store';

const baseData = require('../data.json');
const schema = require('../schema.json');

let data;
const reset = () => {
  data = _.cloneDeep(baseData);
};
beforeEach(reset);

describe('store: basic static', () => {
  test('server: get', () => {
    const store = createStore(schema, { server: data });
    expect(store.get()).toEqual(data);
    expect(store.get('Person')).toEqual(data.Person);
    expect(store.get('Person', 'A')).toEqual(data.Person.A);
    expect(store.get('Person', 'A', 'email')).toEqual(data.Person.A.email);
    expect(store.get('X')).toBe(undefined);
    expect(store.get('X', 'Y')).toBe(undefined);
    expect(store.get('X', 'Y', 'Z')).toBe(undefined);
  });
  test('client: get', () => {
    const store = createStore(schema, { client: data });
    expect(store.get()).toEqual(data);
    expect(store.get('Person')).toEqual(data.Person);
    expect(store.get('Person', 'A')).toEqual(data.Person.A);
    expect(store.get('Person', 'A', 'email')).toEqual(data.Person.A.email);
    expect(store.get('X')).toBe(undefined);
    expect(store.get('X', 'Y')).toBe(undefined);
    expect(store.get('X', 'Y', 'Z')).toBe(undefined);
  });
  test('server and client: get', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    expect(store.get()).toEqual(data);
    expect(store.get('Person')).toEqual(data.Person);
    expect(store.get('Person', 'A')).toEqual(data.Person.A);
    expect(store.get('Person', 'A', 'email')).toEqual(data.Person.A.email);
    expect(store.get('X')).toBe(undefined);
    expect(store.get('X', 'Y')).toBe(undefined);
    expect(store.get('X', 'Y', 'Z')).toBe(undefined);
  });

  test('client: set store', () => {
    const store = createStore(schema, { client: data });
    store.set({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    expect(store.get()).toEqual(data);
  });
  test('client: set collection', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    expect(store.get()).toEqual(data);
  });
  test('client: set record', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', { firstName: '1' });
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('client: set value', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', 'firstName', '1');
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('client: set store with undefined', () => {
    const store = createStore(schema, { client: data });
    store.set({
      Person: { A: { firstName: undefined }, B: undefined },
      Address: undefined,
    });
    delete data.Person.A.firstName;
    delete data.Person.B;
    delete data.Address;
    expect(store.get()).toEqual(data);
  });
  test('client: set collection with undefined', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', { A: { firstName: undefined }, B: undefined });
    delete data.Person.A.firstName;
    delete data.Person.B;
    expect(store.get()).toEqual(data);
  });
  test('client: set record with undefined', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', { firstName: undefined });
    delete data.Person.A.firstName;
    expect(store.get()).toEqual(data);
  });
  test('client: set collection to undefined', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', undefined);
    delete data.Person;
    expect(store.get()).toEqual(data);
  });
  test('client: set record to undefined', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', undefined);
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });
  test('client: set value to undefined', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', 'firstName', undefined);
    delete data.Person.A.firstName;
    expect(store.get()).toEqual(data);
  });
  test('client: set store with null', () => {
    const store = createStore(schema, { client: data });
    store.set({ Person: { A: null } });
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });
  test('client: set collection with null', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', { A: null });
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });
  test('client: set record to null', () => {
    const store = createStore(schema, { client: data });
    store.set('Person', 'A', null);
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });

  test('server: set store', () => {
    const store = createStore(schema, { server: data });
    store.set({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    expect(store.get()).toEqual(data);
  });
  test('server: set collection', () => {
    const store = createStore(schema, { server: data });
    store.set('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    expect(store.get()).toEqual(data);
  });
  test('server: set record', () => {
    const store = createStore(schema, { server: data });
    store.set('Person', 'A', { firstName: '1' });
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('server: set value', () => {
    const store = createStore(schema, { server: data });
    store.set('Person', 'A', 'firstName', '1');
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('server: set store with undefined', () => {
    const store = createStore(schema, { server: data });
    store.set({
      Person: { A: { firstName: undefined }, B: undefined },
      Address: undefined,
    });
    expect(store.get()).toEqual(data);
  });
  test('server: set store with null', () => {
    const store = createStore(schema, { server: data });
    store.set({
      Person: { A: null },
    });
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });

  test('server and client: set store', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    expect(store.get()).toEqual(data);
  });
  test('server and client: set collection', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set('Person', { A: { firstName: '1' }, B: { firstName: '2' } });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    expect(store.get()).toEqual(data);
  });
  test('server and client: set record', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set('Person', 'A', { firstName: '1' });
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('server and client: set value', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set('Person', 'A', 'firstName', '1');
    data.Person.A.firstName = '1';
    expect(store.get()).toEqual(data);
  });
  test('server and client: set store with undefined', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set({
      Person: { A: { firstName: undefined }, B: undefined },
      Address: undefined,
    });
    data.Person.A.firstName = baseData.Person.A.firstName;
    data.Person.B = baseData.Person.B;
    data.Address = baseData.Address;
    expect(store.get()).toEqual(data);
  });
  test('server and client: set store with null', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.set({ Person: { A: null } });
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });

  test('server: set server', () => {
    const store = createStore(schema, { server: data });
    store.setServer({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    expect(store.get()).toEqual(data);
  });
  test('server: set server with null', () => {
    const store = createStore(schema, { server: data });
    store.setServer({ Person: { A: null } });
    delete data.Person.A;
    expect(store.get()).toEqual(data);
  });
  test('client: set server', () => {
    const store = createStore(schema, { client: data });
    store.setServer({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
      U: { V: { W: '5' } },
    });
    data.U = { V: { W: '5' } };
    expect(store.get()).toEqual(data);
  });
  test('client: set server with null', () => {
    const store = createStore(schema, { client: data });
    store.setServer({ Person: { A: null } });
    expect(store.get()).toEqual(data);
  });
  test('server and client: set server', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.setServer({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
      U2: { V: { W: '5' } },
    });
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    data.U2 = { V: { W: '5' } };
    expect(store.get()).toEqual(data);
  });
  test('server and client: set server with null', () => {
    const store = createStore(schema, {
      server: data,
      client: { Person: { A: { firstName: '5' } }, U: { V: { W: '6' } } },
    });
    data.Person.A.firstName = '5';
    data.U = { V: { W: '6' } };
    store.setServer({ Person: { A: null } });
    data.Person.A = { firstName: '5' };
    expect(store.get()).toEqual(data);
  });
});
