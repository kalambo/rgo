import { normalize, schema as normalizrSchema } from 'normalizr';
import { Obj } from 'mishmash';

import { Field, isForeignRelation, isScalar, keysToObject, scalars } from '../core';

export default async function loadSchema(url: string) {

  const schema: Obj<Obj<Field>> = JSON.parse(
    await (await fetch(`${url}/schema`, {
      method: 'POST',
      body: JSON.stringify({ query: '{ _schema }' }),
    })).text()
  );

  const entities: Obj<[normalizrSchema.Entity]> = {};
  for (const type of Object.keys(schema)) {
    entities[type] = [new normalizrSchema.Entity(type, {}, {
      processStrategy: ({ id: _, ...data }) => keysToObject(Object.keys(data), f => {
        const field = schema[type][f];
        const decode = isScalar(field) && scalars[field.scalar].decode;
        return (data[f] === null || !decode) ? data[f] :
          (Array.isArray(data[f]) ? data[f].map(decode) : decode(data[f]));
      }),
    })];
  }

  for (const type of Object.keys(schema)) {
    for (const f of Object.keys(schema[type])) {
      const field = schema[type][f];
      if (!isScalar(field)) {
        const relEntity = entities[field.relation.type][0];
        entities[type][0].define({
          [f]: (isForeignRelation(field) || field.isList) ? [relEntity] : relEntity,
        });
      }
    }
  }

  const dataEntity = new normalizrSchema.Entity('data', entities);
  return {
    schema,
    normalize(data) {
      const { entities: { data: _, ...result } } = normalize(data, dataEntity);
      return result;
    },
  };

}
