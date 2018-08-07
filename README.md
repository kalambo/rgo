# RGO

RGO (Realtime Graph Orchestrator) provides a standardised, cached, realtime graph api to any data source.

```
yarn add rgo
```

## Features

- **Efficient, realtime graph queries** for any connected data source
- **Filter, sort and paginate** data at every nested level of a query
- **Make local changes** and see all live queries 'preview' update accordingly (including across relations)
- **Enhance with authentication, validation** and much more with a composable plugin system

## Overview

Inspired by Meteor, RGO connects to a remote data source and fetches required data into a local normalised cache, which it reads directly to resolve nested 'graph' queries in realtime.

In addition, local-only changes can be made to this cache, which are reflected in all active queries, giving a 'preview' of their effect on the remote data.

Finally, these changes can be committed to the remote source, automatically propagating through to any other connected RGO clients.

## How to use

### Creating a client

To construct an RGO client, provide it with a **resolver** for your data:

```js
import rgo, { resolvers } from 'rgo';

const client = rgo(resolvers.db(schema, { find, insert, update, delete }));
```

A resolver is an async function with a specific signature and certain rules of behaviour. The `resolvers` export provides two helper constructors to simplify creating common types of resolver:

- `resolvers.fetch(url, getHeaders?, refresh?)`: resolve over a network, passing requests on to another resolver at the other end (e.g. a server endpoint)
- `resolvers.db(schema, db)`: resolve directly from a database

**Enhancers:**

As they are just functions, resolvers can be easily enhanced with suitable higher-order functions, a number of which are also provided via helper constructors:

- `enhancers.decode`: decode incoming server requests (`resolvers.fetch` encodes dates for transferring as JSON)
- `enhancers.limitQueries(map: (type, info) => limits)`: restrict incoming queries, primarily for authentication
- `enhancers.onCommit(map: (commit, info) => data)`: map all incoming commits, and/or trigger side-effects (such as email notifications)
- `enhancers.onUpdate(map: (update, info) => record)`: like `onCommit`, but mapping individual updates within each commit

**Data schema:**

As well as processing requests, a resolver also provides a **schema** to the client, in the form:

```js
{
  typeA: {
    field1: { ...config },
    field2: { ...config },
    ...
  },
  ...
}
```

Fields can be

- Scalars: `{ scalar: 'boolean' | 'int' | 'float' | 'date' | 'string' | 'json', isList?: boolean }`
- Relations: `{ type: string, isList?: boolean }`
- Foreign relations: `{ type: string, foreign: string }`

All fields have an optional `meta` property too, which can hold additional information about the field for use outside of RGO.

### Running a query

A query is made up of field references, which are either strings (for scalar fields), or objects (for relation fields) in the form:

```js
{
  name: string,
  alias?: string,

  filter?: string | any[],
  sort?: string | string[],
  start?: number,
  end?: number,

  fields: field[]
}
```

- `alias`: returns a field under a different name, which is necessary when using the same field twice in a single query
- `filter`: one or multiple triplets of `[fieldname, operator, value]` (available operators are `'=' | '!=' | '<' | '<=' | '>' | '>=' | 'in'`), combined in the form `['AND' | 'OR', filter1, filter2, ...]` (can be nested)
- `sort`: one or multiple strings of the form `(-)fieldname`, with the optional `-` determining the sort order for that field
- `start`, `end`: for pagination

Queries can be passed to RGO in two ways:

- **Without callback**: The query runs once, and returns a promise which resolves to the result.
- **With callback**: The query runs continually, updating whenever affected by local or remote changes, and returns an `unsubscribe` function which can be called to stop the query.

**Example:**

```js
const data = await client.query({
  name: 'people',

  filter: [
    'AND',
    ['OR', ['firstname', '=', 'Dave'], ['firstname', '=', 'Steve']],
    ['lastname', '!=', 'Jones'],
  ],
  sort: ['dob', '-lastname'],

  fields: [
    'lastname',
    'email',
    {
      name: 'friends',

      sort: 'email',
      start: 1,
      end: 3,

      fields: ['firstname', 'lastname'],
    },
  ],
});

// data = {
//   people: [
//     {
//       lastname: 'Smith',
//       email: 'dave.smith@gmail.com',
//       friends: [
//         {
//           firstname: 'Laura',
//           lastname: null,
//         },
//         ...
//       ],
//     },
//     ...
//   ],
// };
```

### Making local changes

Setting local-only values is very easy, simply pass `{ key: [type, id, fieldname], value: any }` pairs to the client:

```js
client.set({ key: ['people', 'a04nfa2', 'firstname'], value: 'Thomas' }, ...);
```

RGO will automatically update all affected live queries with the provided values, including fetching further data if required (for example if an updated value affects a relation or filter).

### Committing changes

Committing changes is even easier, simply pass in the keys of the values to commit (only keys with local changes set will be processed):

```js
client.commit(['people', 'a04nfa2', 'firstname'], ['people', 'a04nfa2', 'lastname'], ...);
```

The relevant local changes are sent to the remote data source via the resolver, and also merged into the local cache. Note that this wont affect queries, as they will have already been updated when `client.set` was called.
