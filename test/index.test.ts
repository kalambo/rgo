import { MongoClient } from 'mongodb';
import { keysToObject } from 'mishmash';

import { buildSchema } from '../src';

import types from './types';

it('server', async () => {

  const db = await MongoClient.connect('mongodb://localhost:27017/test');

  const schema = buildSchema(keysToObject(Object.keys(types), type => types[type](db)));

  const schemaResult = await schema('{ SCHEMA }');

  expect(schemaResult).toBe('');

});
