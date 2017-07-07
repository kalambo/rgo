import { streamState } from 'mishmash';
import * as most from 'most';
import * as get from 'lodash/fp/get';
import * as set from 'lodash/fp/set';
import * as merge from 'lodash/fp/merge';

import { DataKey } from '../core';

import graphApi, { Auth } from './graphApi';
import prepareQuery from './prepareQuery';
import read from './read';

const loading = Symbol();

const keyToArray = (key: DataKey) =>
  [key.type, key.id, key.field].filter(x => x);

export default async function client(url: string, auth: Auth) {
  const api = await graphApi(url, auth);

  let currentState = {
    server: {} as any,
    client: {} as any,
    combined: {} as any,
  };
  const { state$, setState } = streamState(currentState);
  state$.observe(state => (currentState = state));

  return {
    schema: api.schema as any,

    value$: (key: DataKey) =>
      state$
        .map(({ combined }) => get(keyToArray(key), combined))
        .skipRepeats() as most.Stream<any>,
    read$: (query, variables, idsOnly?: boolean) => {
      const { apiQuery, readQuery } = prepareQuery(query, idsOnly);
      const ready$ = most
        .fromPromise(api.query(apiQuery, variables))
        .tap(data => {
          const newServer = merge(currentState.server, data || {});
          setState({
            server: newServer,
            client: currentState.client,
            combined: merge(newServer, client),
          });
        })
        .constant(true)
        .startWith(false);
      return state$
        .combine(
          ({ combined }, user, ready) => ({ data: combined, user, ready }),
          auth.user$,
          ready$,
        )
        .scan(
          (prev, { data, user, ready }) =>
            ready
              ? read(api.schema, readQuery, variables, data, prev, user)
              : loading,
          null,
        )
        .skipRepeats() as most.Stream<any>;
    },

    set: (key: DataKey, value) =>
      setState({
        server: currentState.server,
        client: set(keyToArray(key), value, currentState.client),
        combined: set(keyToArray(key), value, currentState.combined),
      }),
    setMany: (values: [DataKey, any][]) =>
      setState({
        server: currentState.server,
        client: values.reduce(
          (res, [key, value]) => set(keyToArray(key), value, res),
          currentState.client,
        ),
        combined: values.reduce(
          (res, [key, value]) => set(keyToArray(key), value, res),
          currentState.combined,
        ),
      }),

    mutate: async (keys?: DataKey[]) => {
      const mutationData = !keys
        ? currentState.client
        : keys.reduce(
            (res, k) =>
              set(
                keyToArray(k),
                get(keyToArray(k), currentState.combined),
                res,
              ),
            {},
          );

      const clearedClient = !keys
        ? {}
        : keys.reduce(
            (res, k) => set(keyToArray(k), undefined, res),
            currentState.client,
          );

      const prevServer = currentState.server;
      const optimisticServer = merge(prevServer, mutationData);
      setState({
        server: optimisticServer,
        client: clearedClient,
        combined: merge(optimisticServer, clearedClient),
      });

      const result = await api.mutate(mutationData);
      const finalServer = result ? merge(prevServer, result) : prevServer;
      setState({
        server: finalServer,
        client: clearedClient,
        combined: merge(finalServer, clearedClient),
      });
    },
  };
}
