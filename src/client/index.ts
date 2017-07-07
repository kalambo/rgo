import { Obj } from 'mishmash';

((...x) => x) as Obj;

// import { DataKey } from '../core';

import graphApi, { AuthFetch } from './graphApi';
import prepareQuery from './prepareQuery';
import createStore from './store';

export default async function client(url: string, authFetch: AuthFetch) {
  const api = await graphApi(url, authFetch);
  const store = createStore();

  function query(
    queryString: string,
    variables: Obj<any>,
    idsOnly: boolean,
  ): Promise<Obj<any>>;
  function query(
    queryString: string,
    variables: Obj<any>,
    idsOnly: boolean,
    listener: (value: Obj<any>) => void,
  ): () => void;
  function query(...args) {
    const [queryString, variables, idsOnly, listener] = args as [
      string,
      Obj<any>,
      boolean,
      ((value: Obj<any>) => void) | undefined
    ];

    const { apiQuery, readQuery } = prepareQuery(queryString, idsOnly);
    if (listener) {
      let unlisten: boolean | (() => void) = false;
      api.query(apiQuery, variables).then(data => {
        store.setServer(data);
        if (!unlisten)
          unlisten = store.read(
            api.schema,
            readQuery,
            variables,
            null,
            listener,
          );
      });
      return () =>
        typeof unlisten === 'function' ? unlisten() : (unlisten = true);
    } else {
      return api.query(apiQuery, variables).then(data => {
        store.setServer(data);
        return store.read(api.schema, readQuery, variables, null);
      });
    }
  }

  // async function mutate(keys: DataKey[]) {
  //   const mutationData = keys.reduce(
  //     (res, k) =>
  //       set(keyToArray(k), get(keyToArray(k), currentState.combined), res),
  //     {},
  //   );

  //   const clearedClient = !keys
  //     ? {}
  //     : keys.reduce(
  //         (res, k) => set(keyToArray(k), undefined, res),
  //         currentState.client,
  //       );

  //   const prevServer = currentState.server;
  //   const optimisticServer = merge(prevServer, mutationData);
  //   setState({
  //     server: optimisticServer,
  //     client: clearedClient,
  //     combined: merge(optimisticServer, clearedClient),
  //   });

  //   const result = await api.mutate(mutationData);
  //   const finalServer = result ? merge(prevServer, result) : prevServer;
  //   setState({
  //     server: finalServer,
  //     client: clearedClient,
  //     combined: merge(finalServer, clearedClient),
  //   });
  // }

  return {
    get: store.get,
    query,
    // mutate,
  };
}
