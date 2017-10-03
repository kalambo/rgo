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
  let authField: { type: string; field: string } | null = null;
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
        if (newTokens) {
          setAuth({ id: authState.id, ...newTokens });
          const retryResponses = await runFetch(
            errorResponses.map(({ index }) => body[index]),
          );
          errorResponses.forEach(
            ({ index }, i) => (responses[index] = retryResponses[i]),
          );
        }
      }
      return responses;
    } catch {
      if (auth && auth.refresh && authState && authState.refresh) {
        const newTokens = await auth.refresh(authState.refresh);
        if (newTokens) {
          setAuth({ id: authState.id, ...newTokens });
          return await runFetch(body);
        }
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
    for (const type of Object.keys(schema)) {
      for (const field of Object.keys(schema[type])) {
        if ((schema[type][field] as any).scalar === 'auth') {
          authField = { type, field };
          (schema[type][field] as any).scalar = 'string';
        }
      }
    }
    state = new ClientState(schema, authField, log);
    fetcher = createFetcher(authFetch, schema, (data, indices) => {
      state.setServer(data, indices);
    });
    state.watch(fetcher.process);
    readyListeners.forEach(l => l());
  })();

  let queryCounter = 0;

  const splitAuthField = (
    values: Obj<Obj>,
    authKey: [string, string, string] | null,
  ) => {
    if (!authField || !authKey) return values;
    const { username, password } = JSON.parse(_.get(values, authKey) || '{}');
    _.set(values, authKey, noUndef(username));
    _.set(values, [authKey[0], authKey[1], 'password'], noUndef(password));
    return values;
  };

  const mutate = async (keys: string[], clearKeys?: string[]) => {
    let resolvePromise: (data: Data | null) => void;
    const promise = new Promise<Data | null>(
      resolve => (resolvePromise = resolve),
    );
    fetcher.addMutation(
      keys
        .filter(key => !key.endsWith('.password'))
        .map(key => ({ key, value: noUndef(_.get(state.combined, key)) })),
      async (newIds, error) => {
        if (error) {
          resolvePromise(null);
        } else {
          if (auth && newIds['$user']) {
            // setAuth(
            //   await auth.login(
            //     newIds['$user'].username,
            //     newIds['$user'].password,
            //   ),
            // );
            delete newIds['$user'];
          }
          state.setClient(
            [...keys, ...(clearKeys || [])].reduce(
              (res, k) => _.set(res, k, undefined),
              {},
            ),
          );
          const data = {};
          keys.forEach(key => {
            const [type, id, fieldName] = key.split('.');
            const newId = newIds[type][id] || id;
            _.set(
              data,
              key,
              noUndef(_.get(state.combined, [type, newId, fieldName])),
            );
            data[type][id].id = newId;
          });
          resolvePromise(data);
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
        (values: Obj<Obj> | null) => void
      ];

      return promisifyEmitter(innerListener => {
        let authKey: [string, string, string] | null = null;
        for (const [type, id, fieldName] of keys) {
          if (
            authField &&
            type === authField.type &&
            (fieldName === authField.field || fieldName === 'password')
          ) {
            authKey = [type, id, authField.field];
          }
        }

        let running = true;
        let unlisten;
        const unwatch = fetcher.addFields(keys, isLoading => {
          if (running) {
            if (isLoading) {
              innerListener(null);
            } else {
              const values = {};
              keys.forEach(k =>
                _.set(values, k, noUndef(_.get(state.combined, k))),
              );

              innerListener(splitAuthField(values, authKey));
              unlisten =
                keys.length === 1
                  ? state.watch(keys[0].join('.'), value => {
                      _.set(values, keys[0], value);
                      if (running) {
                        innerListener(splitAuthField(values, authKey));
                      }
                    })
                  : state.watch(({ changes, changedData }) => {
                      const changedKeys = keys.filter(key =>
                        _.get(changes, key),
                      );
                      if (changedKeys.length > 0) {
                        for (const key of changedKeys) {
                          _.set(values, key, _.get(changedData, key));
                        }
                        if (running) {
                          innerListener(splitAuthField(values, authKey));
                        }
                      }
                    });
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

    set(...args) {
      return (state.setClient as any)(...args);
    },

    mutate,
  };
}
