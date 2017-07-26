import { normalize, schema as normalizrSchema } from 'normalizr';

import { Field, fieldIs, keysToObject, mapArray, Obj, scalars } from '../core';

export default async function loadSchema(url: string) {
  const schema: Obj<Obj<Field>> = JSON.parse(
    (await (await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ SCHEMA }' }),
    })).json()).data.SCHEMA,
  );

  const entities: Obj<[normalizrSchema.Entity]> = {};
  for (const type of Object.keys(schema)) {
    entities[type] = [
      new normalizrSchema.Entity(
        type,
        {},
        {
          processStrategy: ({ id: _, ...data }) =>
            keysToObject(Object.keys(data), f => {
              const field = schema[type][f];
              const decode =
                fieldIs.scalar(field) && scalars[field.scalar].decode;
              return data[f] === null || !decode
                ? data[f]
                : mapArray(data[f], decode);
            }),
        },
      ),
    ];
  }

  for (const type of Object.keys(schema)) {
    for (const f of Object.keys(schema[type])) {
      const field = schema[type][f];
      if (!fieldIs.scalar(field)) {
        const relEntity = entities[field.type][0];
        entities[type][0].define({
          [f]:
            fieldIs.foreignRelation(field) || field.isList
              ? [relEntity]
              : relEntity,
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
