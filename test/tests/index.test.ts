import { ExecutionResult } from 'graphql';
import { Db, MongoClient } from 'mongodb';
import { keysToObject } from 'mishmash';

import { buildSchema } from '../../src';

import types from './../types';

let db: Db;
let schema: (query: string, context?: any, variables?: any) => Promise<ExecutionResult>;

beforeAll(async () => {
  db = await MongoClient.connect('mongodb://localhost:27017/test');
  schema = buildSchema(keysToObject(Object.keys(types), type => types[type](db)));
});

test('server', async () => {

  const schemaResult = await schema('{ SCHEMA }');

  expect(schemaResult).toEqual({
    data: {
      SCHEMA: JSON.stringify(
        keysToObject(Object.keys(types), type => types[type](db).fields),
        (_, v) => typeof v === 'function' ? true : v,
      )
    },
  });

});
