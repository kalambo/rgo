import * as _ from 'lodash';

import createStore from '../../src/client/store';

const baseData = require('../data.json');
const schema = require('../schema.json');

let data;
const reset = () => {
  data = _.cloneDeep(baseData);
};
beforeEach(reset);

describe('store: watch', () => {
  test('client: watch store', () => {
    const store = createStore(schema, { client: data });

    let storeValue;
    let storeChanges = 0;
    const storeUnsubscribe = store.get(v => {
      storeValue = v;
      storeChanges++;
    });
    expect(storeChanges).toBe(1);

    let collectionValue;
    let collectionChanges = 0;
    const collectionUnsubscribe = store.get('Person', v => {
      collectionValue = v;
      collectionChanges++;
    });
    expect(collectionChanges).toBe(1);

    let recordValue;
    let recordChanges = 0;
    const recordUnsubscribe = store.get('Person', 'A', v => {
      recordValue = v;
      recordChanges++;
    });
    expect(recordChanges).toBe(1);

    let valueValue;
    let valueChanges = 0;
    const valueUnsubscribe = store.get('Person', 'A', 'firstName', v => {
      valueValue = v;
      valueChanges++;
    });
    expect(valueChanges).toBe(1);

    store.set({
      Person: { A: { firstName: '1' }, B: { firstName: '2' } },
      Address: { C: { street: '3' }, D: { street: '4' } },
    });
    data.Person.A.firstName = '1';
    data.Person.B.firstName = '2';
    data.Address.C.street = '3';
    data.Address.D.street = '4';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(2);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(2);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(2);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(2);

    store.set('Person', { A: { firstName: '5' }, B: { firstName: '6' } });
    data.Person.A.firstName = '5';
    data.Person.B.firstName = '6';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(3);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(3);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(3);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(3);

    store.set('Person', 'A', { firstName: '7' });
    data.Person.A.firstName = '7';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(4);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(4);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(4);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(4);

    store.set('Person', 'A', 'firstName', '8');
    data.Person.A.firstName = '8';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(5);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(5);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(5);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(5);

    store.set('Person', 'A', 'firstName', '8');
    expect(storeChanges).toBe(5);
    expect(collectionChanges).toBe(5);
    expect(recordChanges).toBe(5);
    expect(valueChanges).toBe(5);

    store.set('Address', 'A', 'city', '9');
    data.Address.A.city = '9';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(6);
    expect(collectionChanges).toBe(5);
    expect(recordChanges).toBe(5);
    expect(valueChanges).toBe(5);

    store.set('Person', 'B', 'firstName', '10');
    data.Person.B.firstName = '10';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(7);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(6);
    expect(recordChanges).toBe(5);
    expect(valueChanges).toBe(5);

    store.set('Person', 'A', 'email', '11');
    data.Person.A.email = '11';
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(8);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(7);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(6);
    expect(valueChanges).toBe(5);

    store.set({
      Person: { A: { firstName: undefined }, B: undefined },
      Address: undefined,
    });
    delete data.Person.A.firstName;
    delete data.Person.B;
    delete data.Address;
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(9);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(8);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(7);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(6);

    store.setServer({
      Person: { A: { firstName: '12' }, B: { firstName: '13' } },
      Address: { C: { street: '14' }, D: { street: '15' } },
    });
    data.Person.A.firstName = '12';
    data.Person.B = { firstName: '13' };
    data.Address = { C: { street: '14' }, D: { street: '15' } };
    expect(storeValue).toEqual(data);
    expect(storeChanges).toBe(10);
    expect(collectionValue).toEqual(data.Person);
    expect(collectionChanges).toBe(9);
    expect(recordValue).toEqual(data.Person.A);
    expect(recordChanges).toBe(8);
    expect(valueValue).toEqual(data.Person.A.firstName);
    expect(valueChanges).toBe(7);

    storeUnsubscribe();
    collectionUnsubscribe();
    recordUnsubscribe();
    valueUnsubscribe();
    store.set({
      Person: { A: { firstName: '16' }, B: { firstName: '17' } },
      Address: { C: { street: '18' }, D: { street: '19' } },
    });
    expect(storeChanges).toBe(10);
    expect(collectionChanges).toBe(9);
    expect(recordChanges).toBe(8);
    expect(valueChanges).toBe(7);
  });
});
