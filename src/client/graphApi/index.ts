import { DocumentNode, print } from 'graphql';
import { Obj } from 'mishmash';

import { Auth } from '../typings';

import batchFetch from './batchFetch';
import loadSchema from './loadSchema';
import { encodeScalar } from './scalars';

export const allKeys = (objects: any[]) => (
  Array.from(new Set(objects.reduce((res, o) => [...res, ...Object.keys(o)], []))) as string[]
);

export default async function graphApi(url: string, rules?: Obj<Obj>) {

  const { schema, normalize } = await loadSchema(url, rules);
  const fetch = batchFetch(url);

  return {

    schema,

    async query(query: DocumentNode, variables: any, auth: Auth | null) {

      const result = await fetch({ query: print(query), variables }, auth);
      return result ? normalize(result.data) : null;
    },

    async mutate (data: any, auth: Auth | null) {

      const types = Object.keys(data);
      const mutations = types.reduce((res, type) => ({ ...res,
        [type]: Object.keys(data[type])
          .map(id => Object.keys(data[type][id]).reduce((res, field) => ({ ...res,
            [field]: encodeScalar(schema[type][field].scalar, data[type][id][field]),
          }), { id: encodeScalar('ID', id) })),
      }), {});

      const query = `
        mutation Mutate(${types.map(t => `$${t}: [${t}Input!]`).join(', ')}) {
          mutate(${types.map(t => `${t}: $${t}`).join(', ')}) {
            ${types.map(t => `${t} {
              ${[
                ...allKeys(mutations[t]),
                ...Object.keys(schema[t]).filter(f => schema[t][f].isReadonly),
                'modifiedAt',
              ].map(f => schema[t][f].relation ? `${f} { id }` : f).join('\n')}
            }`)}
          }
        }
      `;

      const result = await fetch({ query, variables: mutations }, auth)
      return result ? normalize(result.data.mutate) : null;
    },

  };

}
