import graphql from 'graphql-anywhere';

import resolver from './resolver';
import preserveRefs from './preserveRefs';

export default function read(schema, query, variables, data, previousResult, auth) {

  const context = { schema, data, user: auth && auth.user || null, previousResult };

  return graphql(resolver, query, null, context, variables, {

    resultMapper: (resultFields, resultRoot) => {
      const prev = resultRoot === null ? previousResult : resultRoot && resultRoot.__previous;
      return preserveRefs(prev, resultFields);
    },

  });

}
