export { Client, FieldConfig } from './typings';

import * as _ from 'lodash';
import { parse } from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  isEmptyValue,
  keysToObject,
  noUndef,
  Obj,
  promisifyEmitter,
  Rules,
  ScalarField,
  ScalarName,
  validate as validateField,
} from '../core';

import ClientState from './clientState';
import createFetcher from './createFetcher';
import queryLayers from './queryLayers';
import readLayer from './readLayer';
import {
  AuthFetch,
  Client,
  DataChanges,
  FieldConfig,
  FieldState,
  QueryOptions,
} from './typings';

export async function buildClient(
  url: string,
  authFetch: AuthFetch,
  log?: boolean,
): Promise<Client> {
  const schema: Obj<Obj<Field>> = (await authFetch(url, {
    query: '{ SCHEMA }',
  })).data.SCHEMA;

  const state = new ClientState(schema, log);

  let queryCounter = 0;
  const fetcher = createFetcher(url, authFetch, schema, (data, indices) => {
    state.setServer(data, indices);
  });
  state.watch(fetcher.process);

  interface FieldInfo {
    scalar: ScalarName;
    isList?: true;
    rules: Rules;
    required?: boolean;
    showIf?: Obj;
  }
  const watchFields = <T>(
    config: FieldConfig | FieldConfig[],
    getResult: (info: Obj<FieldInfo>, values: Obj) => T,
    clear: boolean,
    listener?: (value: T | null) => void,
  ) => {
    return promisifyEmitter(innerListener => {
      const configArray = Array.isArray(config) ? config : [config];
      const allKeysObj: Obj<true> = {};
      const info = keysToObject<FieldConfig, FieldInfo>(
        configArray,
        ({ key, rules, required, showIf }) => {
          const [type, id, fieldName] = key.split('.');
          const field = schema[type][fieldName] as ScalarField;
          const allRules = { ...rules || {}, ...field.rules || {} };
          if (field.rules && field.rules.lt) {
            allRules.lt = `${type}.${id}.${field.rules.lt}`;
          }
          if (field.rules && field.rules.gt) {
            allRules.gt = `${type}.${id}.${field.rules.gt}`;
          }
          if (allRules.lt) allKeysObj[allRules.lt] = true;
          if (allRules.gt) allKeysObj[allRules.gt] = true;
          if (Array.isArray(config)) {
            Object.keys(showIf || {}).forEach(k => (allKeysObj[k] = true));
          }
          allKeysObj[key] = true;
          return {
            scalar: field.scalar,
            isList: field.isList,
            rules: allRules,
            required,
            showIf,
          };
        },
        ({ key }) => key,
      );
      const allKeys = Object.keys(allKeysObj);

      let running = true;
      let unlisten;
      const unwatch = fetcher.addFields(allKeys, isLoading => {
        if (running) {
          if (isLoading) {
            innerListener(null);
          } else {
            allKeys
              .map(k => configArray.find(({ key }) => key === k)!)
              .filter(x => x && x.default !== undefined)
              .forEach(({ key, default: defaultValue }) => {
                const value = noUndef(_.get(state.combined, key));
                if (value === null)
                  (state.setClient as any)(...key.split('.'), defaultValue);
              });
            const values = keysToObject(allKeys, key =>
              noUndef(_.get(state.combined, key)),
            );
            innerListener(getResult(info, values));
            unlisten =
              allKeys.length === 1
                ? state.watch(allKeys[0], value => {
                    values[allKeys[0]] = value;
                    if (running) innerListener(getResult(info, values));
                  })
                : state.watch(({ changes, changedData }) => {
                    const changedKeys = allKeys.filter(key =>
                      _.get(changes, key),
                    );
                    if (changedKeys.length > 0) {
                      for (const key of changedKeys) {
                        values[key] = _.get(changedData, key);
                      }
                      if (running) innerListener(getResult(info, values));
                    }
                  });
          }
        }
      });
      return () => {
        running = false;
        unwatch();
        if (unlisten) unlisten();
        if (clear) {
          state.setClient(
            allKeys.reduce((res, k) => _.set(res, k, undefined), {}),
          );
        }
      };
    }, listener);
  };

  const mutate = async (keys: string[], clearKeys?: string[]) => {
    let resolvePromise: (data: Data) => void;
    const promise = new Promise<Data>(resolve => (resolvePromise = resolve));
    fetcher.addMutation(
      keys.map(key => ({ key, value: noUndef(_.get(state.combined, key)) })),
      newIds => {
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
      },
    );
    return promise;
  };

  return {
    types: keysToObject(Object.keys(schema), type =>
      keysToObject(Object.keys(schema[type]), fieldName => {
        const field = schema[type][fieldName];
        return fieldIs.scalar(field) ? field.scalar : field.type;
      }),
    ),

    newId: state.newId.bind(state),

    field(field: FieldConfig, listener?: (value: FieldState | null) => void) {
      return watchFields(
        field,
        (info, values) => ({
          scalar: info[field.key].scalar,
          isList: !!info[field.key].isList,
          rules: info[field.key].rules,
          value: values[field.key],
          onChange: value =>
            (state.setClient as any)(
              ...field.key.split('.'),
              info[field.key].rules.url
                ? value && value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                : value,
            ),
          invalid: isEmptyValue(values[field.key])
            ? !!info[field.key].required
            : !validateField(
                info[field.key].scalar,
                info[field.key].rules,
                values[field.key],
                values,
              ),
        }),
        false,
        listener,
      ) as any;
    },

    fields(
      fields: FieldConfig[],
      listener?: (
        value: { invalid: boolean; active: boolean[] } | null,
      ) => void,
    ) {
      return watchFields(
        fields,
        (info, values) => {
          const active = fields.map(
            ({ key }) =>
              info[key].showIf
                ? Object.keys(info[key].showIf!).every(
                    k =>
                      values[k] === info[key].showIf![k] ||
                      (Array.isArray(info[key].showIf![k]) &&
                        info[key].showIf![k].includes(values[k])),
                  )
                : true,
          );
          const invalid = fields.some(
            ({ key }, i) =>
              active[i] &&
              (isEmptyValue(values[key])
                ? !!info[key].required
                : !validateField(
                    info[key].scalar,
                    info[key].rules,
                    values[key],
                    values,
                  )),
          );
          return {
            active,
            invalid,
            async mutate() {
              if (!invalid) {
                return await mutate(
                  fields.filter((_, i) => active[i]).map(({ key }) => key),
                  fields.filter((_, i) => !active[i]).map(({ key }) => key),
                );
              }
            },
          };
        },
        true,
        listener,
      ) as any;
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

    set: state.setClient.bind(state),

    mutate,
  };
}
