import { MongoClient } from 'mongodb';
import { keysToObject } from 'mishmash';

import { buildSchema } from '../src';

import types from './types';

(async () => {

  const db = await MongoClient.connect('mongodb://localhost:27017/test');
  const schema = buildSchema(keysToObject(Object.keys(types), type => types[type](db)));

  console.log(await schema('{ SCHEMA }'));

})();
