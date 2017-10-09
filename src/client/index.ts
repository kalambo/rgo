export { Client } from './typings';
export { ScalarName } from '../core';

import * as _ from 'lodash';
import { parse } from 'graphql';

import {
  Data,
  Field,
  noUndef,
  Obj,
  promisifyEmitter,
  QueryRequest,
  QueryResponse,
} from '../core';

import ClientState from './clientState';
import createFetcher from './createFetcher';
import queryLayers from './queryLayers';
import readLayer from './readLayer';
import { AuthState, Client, DataChanges, QueryOptions } from './typings';

export function buildClient(
  url: string,
  auth?: {
    login: (username: string, password: string) => Promise<AuthState>;
    logout: (authToken: string) => void | Promise<void>;
    refresh?: (
      refreshToken: string,
    ) => Promise<{ token: string; refresh: string } | null>;
  },
  log?: boolean,
): Client {
  let authState: AuthState | null;
  let schema: Obj<Obj<Field>>;
  let state: ClientState;
  let fetcher: any;

  let loggedInListeners: ((value: boolean) => void)[] = [];
  const setAuth = (newAuth: AuthState | null) => {
    authState = newAuth;
    if (!newAuth) localStorage.removeItem('kalamboAuth');
    else localStorage.setItem('kalamboAuth', JSON.stringify(newAuth));
    loggedInListeners.forEach(l => l(!!authState));
  };
  const runFetch = async (body: QueryRequest[]): Promise<QueryResponse[]> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authState ? { Authorization: `Bearer ${authState.token}` } : {},
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  };
  const authFetch = async (body: QueryRequest[]): Promise<QueryResponse[]> => {
    try {
      const responses = await runFetch(body);
      const errorResponses = responses
        .map((response, index) => ({ errors: response.errors, index }))
        .filter(
          ({ errors }) =>
            errors && errors!.some(e => e.message === 'Not authorized'),
        );
      if (
        errorResponses.length > 0 &&
        auth &&
        auth.refresh &&
        authState &&
        authState.refresh
      ) {
        const newTokens = await auth.refresh(authState.refresh);
        if (newTokens) setAuth({ id: authState.id, ...newTokens });
        else setAuth(null);
        const retryResponses = await runFetch(
          errorResponses.map(({ index }) => body[index]),
        );
        errorResponses.forEach(
          ({ index }, i) => (responses[index] = retryResponses[i]),
        );
      }
      return responses;
    } catch {
      if (auth && auth.refresh && authState && authState.refresh) {
        const newTokens = await auth.refresh(authState.refresh);
        if (newTokens) setAuth({ id: authState.id, ...newTokens });
        else setAuth(null);
        return await runFetch(body);
      }
      return body.map(() => ({ errors: [{ name: '', message: '' }] }));
    }
  };

  const readyListeners: (() => void)[] = [];
  (async () => {
    authState = JSON.parse(
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('kalamboAuth')) ||
        'null',
    );
    schema = (await authFetch([{ query: '{ SCHEMA }' }]))[0].data.SCHEMA;
    let authField: { type: string; field: string } | null = null;
    for (const type of Object.keys(schema)) {
      for (const field of Object.keys(schema[type])) {
        if ((schema[type][field] as any).scalar === 'auth') {
          authField = { type, field };
          (schema[type][field] as any).scalar = 'string';
          schema[type].password = { scalar: 'string' };
        }
      }
    }
    state = new ClientState(schema, log);
    fetcher = createFetcher(authFetch, schema, authField, (data, indices) => {
      state.setServer(data, indices);
    });
    state.watch(fetcher.process);
    readyListeners.forEach(l => l());
  })();

  let queryCounter = 0;

  const commit = async (keys: [string, string, string][]) => {
    let resolvePromise: (value: { values: any[]; newIds: Obj } | null) => void;
    const promise = new Promise<{ values: any[]; newIds: Obj } | null>(
      resolve => (resolvePromise = resolve),
    );
    fetcher.addCommit(
      keys.map(key => ({ key, value: noUndef(_.get(state.combined, key)) })),
      async (newIds, error) => {
        if (error) {
          resolvePromise(null);
        } else {
          if (auth && newIds['$user']) delete newIds['$user'];
          state.setClient(keys.map(key => ({ key, value: undefined })));
          resolvePromise({
            values: keys.map(([type, id, field]) =>
              noUndef(
                _.get(state.combined, [
                  type,
                  (newIds[type] && newIds[type][id]) || id,
                  field,
                ]),
              ),
            ),
            newIds,
          });
        }
      },
    );
    return promise;
  };

  return {
    ready() {
      return new Promise(resolve => {
        if (schema) resolve();
        else readyListeners.push(resolve);
      });
    },
    schema() {
      return schema;
    },
    newId(type) {
      return state.newId(type);
    },

    login(...args: any[]): any {
      if (args.length === 2) {
        return (async () => {
          if (!auth) return 'Auth not configured';
          try {
            setAuth(await auth.login(args[0], args[1]));
            return null;
          } catch (error) {
            return error.message as string;
          }
        })();
      }
      setAuth(args[0]);
    },
    async logout() {
      if (auth && authState) {
        await auth.logout(authState.token);
        setAuth(null);
      }
    },
    loggedIn(listener) {
      listener(!!authState);
      loggedInListeners.push(listener);
      return () => {
        loggedInListeners = loggedInListeners.filter(l => l !== listener);
      };
    },

    get(...args) {
      const [keys, listener] = args as [
        [string, string, string][],
        (values: any[] | null) => void
      ];

      return promisifyEmitter(innerListener => {
        if (keys.length === 0) {
          innerListener([]);
          return () => {};
        }

        let running = true;
        let unlisten;
        const unwatch = fetcher.addFields(keys, isLoading => {
          if (running) {
            if (isLoading) {
              innerListener(null);
            } else {
              innerListener(keys.map(k => noUndef(_.get(state.combined, k))));
              unlisten = state.watch(keys, innerListener);
            }
          }
        });
        return () => {
          running = false;
          unwatch();
          if (unlisten) unlisten();
        };
      }, listener) as any;
    },

    query(...args) {
      const queryDoc = parse(args[0]);
      const [options, onLoad, onChange] = (args.length === 3
        ? [undefined, ...args.slice(1)]
        : args.slice(1)) as [
        (QueryOptions & { info?: true }) | undefined,
        ((data: Obj | { data: Obj; spans: Obj } | null) => void) | undefined,
        ((changes: Data) => void) | true | undefined
      ];
      const { variables, idsOnly, info: withInfo } =
        options || ({} as QueryOptions & { info?: true });

      return promisifyEmitter(onLoadInner => {
        const queryIndex = queryCounter++;

        const layers = queryLayers(
          schema,
          queryDoc,
          variables,
          authState && authState.id,
          idsOnly,
          withInfo,
        );

        let data = {};
        let spans = {};
        let rootUpdaters:
          | ((changes: DataChanges, update: boolean) => number)[]
          | null = null;
        let firstIds: Obj<Obj<string>>;

        let running = true;
        const updateQuery = fetcher.addQuery(
          queryIndex,
          newFirstIds => {
            if (newFirstIds) firstIds = newFirstIds;
            data = {};
            spans = {};
            rootUpdaters = layers.map(layer =>
              readLayer(
                layer,
                { '': data },
                state,
                firstIds,
                withInfo && { '': spans },
              ),
            );
            if (withInfo) {
              spans[''] = Math.max(
                ...layers.map(({ root }) =>
                  spans[root.field].reduce((res, v) => res + v[''], 0),
                ),
                1,
              );
            }
            if (running) onLoadInner(withInfo ? { data, spans } : data);
          },
          () => {
            if (running) onLoadInner(null);
          },
        );
        updateQuery(layers, state);

        const unlisten = state.watch(({ changes, changedData, indices }) => {
          if (!indices || !indices.includes(queryIndex)) {
            const updateType = rootUpdaters
              ? Math.max(
                  ...rootUpdaters.map(updater =>
                    updater(changes, onChange === true),
                  ),
                )
              : 2;
            if (updateType === 2) {
              rootUpdaters = null;
              updateQuery(layers, state);
            } else if (updateType === 1) {
              if (onChange === true) onLoadInner(data);
              else onChange!(changedData);
            }
          }
        });

        return () => {
          running = false;
          updateQuery();
          unlisten();
        };
      }, onLoad) as any;
    },

    set(values) {
      return state.setClient(values);
    },

    commit,
  };
}
