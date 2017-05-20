import { branch, compose, withProps } from 'recompose';
import * as most from 'most';
import { mapPropsStream, Obj, withStore } from 'mishmash';
import merge from 'lodash/fp/merge';

import { dataGet, DataKey, dataSet, isValid, undefToNull } from '../core';

import graphApi from './graphApi';
import read from './read';
import { Auth } from './typings';

const getStateValue = (state: { server: any, client: any }, key: DataKey) => {
  const clientValue = dataGet(state.client, key);
  return undefToNull(clientValue !== undefined ? clientValue : dataGet(state.server, key));
}

const withCombined = ({ server, client }) => {

  const allTypes = Array.from(new Set([...Object.keys(server), ...Object.keys(client)]));

  const combined = allTypes.reduce((res, type) => {

    const serverData = Object.keys(server[type] || []).map(id => ({ id, ...server[type][id] }));
    const clientData = Object.keys(client[type] || []).map(id => ({ id, ...client[type][id] }));

    const result = [...serverData];
    for (const obj of clientData) {
      const index = result.findIndex(o => o.id === obj.id);
      if (index !== -1) result[index] = { ...result[index], ...obj };
      else result.push(obj);
    }

    return { ...res, [type]: result };

  }, {});

  return { server, client, combined };

}

interface DataOptions {
  rules?: Obj<Obj>;
  auth$?: most.Stream<Auth>;
  log?: boolean;
}

export default function withData(url: string, { rules, auth$, log }: DataOptions) {

  return compose(

    mapPropsStream(props$ => {

      const api$ = most.fromPromise<any>(graphApi(url, rules)).startWith(null);

      return props$.combine((props, api, auth) => ({
        ...props, api, auth,
      }), api$, auth$ || most.just(null));

    }),

    withProps(({ api }) => ({
      dataReady: api !== null,
    })),

    branch(
      ({ dataReady }) => dataReady,
      withStore('data', {

        value: ({ getState }, key) => getStateValue(getState(), key),
        schema: ({ getProps }, { type, field }) => getProps().api.schema[type][field],
        valid: ({ getState, getProps }, { type, id, field }, optional) => {
          const { scalar, rules } = getProps().api.schema[type][field];
          return isValid(scalar, rules, optional, getStateValue(getState(), { type, id, field }));
        },
        read: ({ getState, getProps }, query, variables, previousResult) => read(
          getProps().api.schema, query, variables, getState().combined, previousResult,
          getProps().auth,
        ),
        editing: ({ getState }, key) => (
          key ? dataGet(getState().client, key) !== undefined :
            (Object.keys(getState().client).length > 0)
        ),

        * set({ getState }, key, value) {
          yield withCombined({
            server: getState().server,
            client: dataSet(getState().client, key, value),
          });
        },
        * setMany({ getState }, values) {
          yield withCombined({
            server: getState().server,
            client: values.reduce((res, [k, v]) => dataSet(res, k, v), getState().client),
          });
        },
        * clear({ getState }) {
          yield withCombined({
            server: getState().server,
            client: {},
          });
        },
        async * query({ getState, getProps }, query, variables) {

          const result = await getProps().api.query(query, variables, getProps().auth);

          yield withCombined({
            server: merge(getState().server, result || {}),
            client: getState().client,
          });

        },
        async * mutate({ getState, getProps }, keys) {

          const mutationData = !keys ? getState().client :
            keys.reduce((res, k) => dataSet(res, k, dataGet(getState().client, k)), {});

          yield withCombined({
            server: merge(getState().server, mutationData),
            client: keys ? getState().client : {},
          });

          const result = await getProps().api.mutate(mutationData, getProps().auth);

          const clearedData = !keys ? {} :
            keys.reduce((res, k) => dataSet(res, k, undefined), getState().client);

          yield withCombined({
            server: merge(getState().server, result || {}),
            client: clearedData,
          });

        },

      }, { server: {}, client: {}, combined: {} }, log),
    ),

  );
}
