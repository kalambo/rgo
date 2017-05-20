import { normalize, schema as normalizrSchema } from 'normalizr';
import { Obj } from 'mishmash';

import { Field } from '../../core';

import { decodeScalar } from './scalars';

export default async function loadSchema(url: string, rules?: Obj<Obj>) {

  const schema: Obj<Obj<Field>> = await (await fetch(`${url}/schema`, { method: 'GET' })).json();

  const entities: Obj<[normalizrSchema.Entity]> = {};
  for (const type of Object.keys(schema)) {
    entities[type] = [new normalizrSchema.Entity(type, {}, {
      processStrategy: ({ id: _, ...data }) => (
        Object.keys(data).reduce((res, field) => ({ ...res,
          [field]: decodeScalar(schema[type][field].scalar, data[field]),
        }), {})
      ),
    })];
  }

  for (const type of Object.keys(schema)) {
    for (const field of Object.keys(schema[type])) {
      schema[type][field].rules === {
        ...schema[type][field],
        ...(rules && rules[type] && rules[type][field] || {}),
      };
      if (schema[type][field].relation) {
        const relEntity = entities[schema[type][field].relation!.type][0];
        entities[type][0].define({ [field]: schema[type][field].isList ? [relEntity] : relEntity });
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
