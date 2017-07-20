import { print } from 'graphql';

import prepareQuery from '../prepareQuery';

const schema = require('./setup/schema.json');

const clean = (s: string) => s.replace(/\n +/g, '\n').trim();

describe('prepareQuery', () => {
  test('basic', () => {
    const { apiQuery, layers, readQuery } = prepareQuery(
      schema,
      `{
        Person(filter: "lastName=Smith") {
          id
          firstName
          address(skip: 5) {
            street
          }
        }
      }`,
      {},
      true,
    );

    expect(clean(apiQuery)).toBe(
      clean(`{
        Person(filter: "lastName=Smith", extra: $Person) {
          id
          firstName
          address(skip: 5, extra: $Person_address) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(layers.Person.query)).toBe(
      clean(`{
        Person(ids: $ids) {
          id
          firstName
          address(skip: 5, extra: $Person_address) {
            street
            id
            createdAt
          }
          lastName
          createdAt
        }
      }`),
    );
    expect(clean(layers.Person_address.query)).toBe(
      clean(`{
        Address(ids: $ids) {
          street
          id
          createdAt
        }
      }`),
    );
    expect(clean(print(readQuery))).toBe(
      clean(`{
        Person(filter: "lastName=Smith") {
          id
          address(skip: 5) {
            id
          }
        }
      }`),
    );
  });
});
