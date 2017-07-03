import { branch, compose, withProps } from 'recompose';
import * as most from 'most';
import { HOC, keysToObject, mapPropsStream, Obj, withStore } from 'mishmash';
import * as get from 'lodash/fp/get';
import * as set from 'lodash/fp/set';
import * as merge from 'lodash/fp/merge';

import { DataKey, isValid, undefToNull } from '../core';

import graphApi, { Auth } from './graphApi';
import read from './read';

interface DataState {
  server: Obj<Obj<Obj<any>>>;
  client: Obj<Obj<Obj<any>>>;
  combined: Obj<Obj<Obj<any>>>;
  arrays: Obj<Obj<any>[]>;
}

const keyToArray = (key: DataKey) => [key.type, key.id, key.field];

const dataToArrays = (data: Obj<Obj<Obj<any>>>): Obj<Obj<any>[]> =>
  keysToObject(Object.keys(data), type =>
    Object.keys(data[type]).map(id => ({ id, ...data[type][id] })),
  );

const clientSet = (state: DataState, key: DataKey, value: any): DataState => {
  const typeArray = state.arrays[key.type] || [];
  const index = typeArray.findIndex(({ id }) => id === key.id);
  return {
    server: state.server,
    client: set(keyToArray(key), value, state.client),
    combined: set(keyToArray(key), value, state.combined),
    arrays: {
      ...state.arrays,
      [key.type]:
        index === -1
          ? [...typeArray, { id: key.id, [key.field]: value }]
          : [
              ...typeArray.slice(0, index),
              { ...typeArray[index], [key.field]: value },
              ...typeArray.slice(index + 1),
            ],
    },
  };
};

const clientInit = (state: DataState, key: DataKey) => ({
  server: state.server,
  client: set(
    keyToArray(key),
    get(keyToArray(key), state.combined),
    state.client,
  ),
  combined: state.combined,
  arrays: state.arrays,
});

const fromServerClient = (
  server: Obj<Obj<Obj<any>>>,
  client: Obj<Obj<Obj<any>>>,
) => {
  const combined = merge(server, client);
  return {
    server,
    client,
    combined,
    arrays: dataToArrays(combined),
  };
};

export default function withData(url: string, auth: Auth, log?: boolean) {
  return compose(
    mapPropsStream(props$ => {
      const api$ = most.fromPromise<any>(graphApi(url, auth)).startWith(null);
      return props$.combine(
        (props, api, user) => ({ ...props, api, user }),
        api$,
        auth.user$,
      );
    }),
    withProps(({ api }) => ({
      dataReady: api !== null,
    })),
    branch(
      ({ dataReady }) => dataReady,
      withStore(
        'data',
        {
          value: ({ getState }, key) =>
            undefToNull(get(keyToArray(key), getState().combined)),
          object: ({ getState }, { type, id }) =>
            undefToNull(get([type, id], getState().combined)),
          schema: ({ getProps }, { type, field }) =>
            getProps().api.schema[type][field],
          valid: ({ getState, getProps }, { type, id, field }) => {
            const { scalar, rules } = getProps().api.schema[type][field];
            return isValid(
              scalar,
              rules,
              get([type, id, field], getState().combined),
            );
          },
          read: ({ getState, getProps }, query, variables, previousResult) =>
            read(
              getProps().api.schema,
              query,
              variables,
              getState().arrays,
              previousResult,
              getProps().user,
            ),
          editing: ({ getState }, key) =>
            key
              ? get(keyToArray(key), getState().client) !== undefined
              : Object.keys(getState().client).length > 0,

          *init({ getState }, keys) {
            yield keys.reduce((res, k) => clientInit(res, k), getState());
          },
          *set({ getState }, key, value) {
            yield clientSet(getState(), key, value);
          },
          *setMany({ getState }, values) {
            yield values.reduce(
              (res, [k, v]) => clientSet(res, k, v),
              getState(),
            );
          },
          *clear({ getState }) {
            yield fromServerClient(getState().server, {});
          },
          async *query({ getState, getProps }, query, variables) {
            const result = await getProps().api.query(query, variables);
            yield fromServerClient(
              merge(getState().server, result || {}),
              getState().client,
            );
          },
          async *mutate({ getState, getProps }, keys) {
            const mutationData = !keys
              ? getState().client
              : keys.reduce(
                  (res, k) =>
                    set(
                      keyToArray(k),
                      get(keyToArray(k), getState().combined),
                      res,
                    ),
                  {},
                );

            const clearedClient = !keys
              ? {}
              : keys.reduce(
                  (res, k) => set(keyToArray(k), undefined, res),
                  getState().client,
                );

            const prevServer = getState().server;
            yield fromServerClient(
              merge(getState().server, mutationData),
              clearedClient,
            );

            const result = await getProps().api.mutate(mutationData);
            yield fromServerClient(
              result ? merge(prevServer, result) : prevServer,
              clearedClient,
            );
          },
        },
        { server: {}, client: {}, combined: {}, arrays: {} },
        log,
      ) as any,
    ),
  ) as HOC;
}
