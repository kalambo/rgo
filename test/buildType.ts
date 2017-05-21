import { Collection } from 'mongodb';
import { keysToObject, Obj } from 'mishmash';

import { connectors, Field, fieldIs } from '../src';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const randomChar = () => characters[Math.floor(Math.random() * characters.length)]

const typeMaps = {
  Date: {
    toDb: v => v.getTime(),
    fromDb: v => new Date(v),
  },
};

export default function buildType(
  collection: Collection, fields: Obj<Field>, fieldDbKeys?: Obj<string>,
) {
  return {
    fields,
    connector: connectors.mongo(
      collection,
      {
        id: '_id',
        ...fieldDbKeys,
      },
      {
        createdAt: typeMaps.Date,
        modifiedAt: typeMaps.Date,
        ...keysToObject(Object.keys(fields), k => {
          const field = fields[k];
          return fieldIs.scalar(field) ? typeMaps[field.scalar] : undefined;
        }),
      },
    ),
    newId: () => Array.from({ length: 17 }, randomChar).join(''),
    auth: {},
  };
}
