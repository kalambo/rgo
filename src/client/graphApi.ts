import { DocumentNode, print } from 'graphql';
import { Obj } from 'mishmash';
import * as throttle from 'lodash/throttle';

import { Field, isForeignRelation, isScalar, keysToObject, scalars } from '../core';

import loadSchema from './loadSchema';

export type AuthFetch = (url: string, body: any[]) => Promise<any[]>;

const allKeys = (objects: any[]) => (
  Array.from(new Set(objects.reduce((res, o) => [...res, ...Object.keys(o)], []))) as string[]
);

const isReadonly = (field: Field) => {
  if (isScalar(field)) return !!field.formula;
  return isForeignRelation(field);
}

export default async function graphApi(url: string, authFetch: AuthFetch) {

  const { schema, normalize } = await loadSchema(url);

  let requestQueue: { body: any, resolve: (result: any) => void }[] = [];
  const processQueue = throttle(async () => {
    const batch = requestQueue;
    requestQueue = [];
    const results = await authFetch(url, batch.map(b => b.body));
    batch.forEach((b, i) => b.resolve(results && results[i] || null));
  }, 100, { leading: false });

  const batchFetch = async (body: any) => {
    return await new Promise<Obj | null>(resolve => {
      requestQueue.push({ body, resolve });
      processQueue();
    });
  };

  return {

    schema,

    async query(query: DocumentNode, variables: any) {

      const result = await batchFetch({ query: print(query), variables });
      return result ? normalize(result.data) : null;
    },

    async mutate (data: any) {

      const typesNames = Object.keys(data);
      const mutations = keysToObject(typesNames, type => Object.keys(data[type]).map(id => ({
        id,
        ...keysToObject(Object.keys(data[type][id]), f => {
          const value = data[type][id][f];
          const field = schema[type][f];
          const encode = isScalar(field) && scalars[field.scalar].encode;
          return (value === null || !encode) ? value :
            (Array.isArray(value) ? value.map(encode) : encode(value));
        })
      })));

      const query = `
        mutation Mutate(${typesNames.map(t => `$${t}: [${t}Input!]`).join(', ')}) {
          mutate(${typesNames.map(t => `${t}: $${t}`).join(', ')}) {
            ${typesNames.map(t => `${t} {
              ${[
                ...allKeys(mutations[t]),
                ...Object.keys(schema[t]).filter(f => isReadonly(schema[t][f])),
                'modifiedAt',
              ].map(f => isScalar(schema[t][f]) ? f : `${f} { id }`).join('\n')}
            }`)}
          }
        }
      `;

      const result = await batchFetch({ query, variables: mutations })
      return result ? normalize(result.data.mutate) : null;
    },

  };

}
