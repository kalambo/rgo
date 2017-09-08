export { Client, FieldConfig } from './typings';

import * as _ from 'lodash';
import { parse } from 'graphql';

import {
  createEmitter,
  createEmitterMap,
  Data,
  Field,
  fieldIs,
  keysToObject,
  noUndef,
  Obj,
  promisifyEmitter,
  Rules,
  ScalarField,
  ScalarName,
  validate as validateField,
} from '../core';

import queryLayers from './queryLayers';
import readLayer from './readLayer';
import { setClient, setServer } from './set';
import createFetcher from './createFetcher';
import {
  AuthFetch,
  Client,
  ClientState,
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
  const schema: Obj<Obj<Field>> = JSON.parse(
    (await (await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ SCHEMA }' }),
    })).json()).data,
  );

  const newIds = keysToObject(Object.keys(schema), () => 0);

  const state: ClientState = { server: {}, client: {}, combined: {}, diff: {} };

  const emitterMap = createEmitterMap<any>();
  const emitter = createEmitter<{
    changes: DataChanges;
    changedData: Data;
    indices?: number[];
  }>();
  const emitChanges = (changes: DataChanges, indices?: number[]) => {
    if (log) console.log(_.cloneDeep(state));
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        for (const id of Object.keys(changes[type])) {
          for (const field of Object.keys(changes[type][id])) {
            emitterMap.emit(
              `${type}.${id}.${field}`,
              noUndef(_.get(state.combined, [type, id, field])),
            );
          }
        }
      }
      const changedData = keysToObject(Object.keys(changes), type =>
        keysToObject(Object.keys(changes[type]), id =>
          keysToObject(Object.keys(changes[type][id]), field =>
            noUndef(_.get(state.combined, [type, id, field])),
          ),
        ),
      );
      emitter.emit({ changes, changedData, indices });
      fetcher.process();
    }
  };

  let queryCounter = 0;
  const fetcher = createFetcher(url, authFetch, schema, (data, indices) => {
    emitChanges(setServer(schema, state, data), indices);
  });

  const set = (...args) => emitChanges(setClient(state, args));

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
    listener?: (value: T) => void,
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
      const unwatch = fetcher.addFields(allKeys, () => {
        allKeys
          .map(k => configArray.find(({ key }) => key === k)!)
          .filter(x => x && x.default !== undefined)
          .forEach(({ key, default: defaultValue }) => {
            const value = noUndef(_.get(state.combined, key));
            if (value === null) set(...key.split('.'), defaultValue);
          });
        const values = keysToObject(allKeys, key =>
          noUndef(_.get(state.combined, key)),
        );
        if (running) innerListener(getResult(info, values));
        unlisten =
          allKeys.length === 1
            ? emitterMap.watch(allKeys[0], value => {
                values[allKeys[0]] = value;
                if (running) innerListener(getResult(info, values));
              })
            : emitter.watch(({ changes, changedData }) => {
                const changedKeys = allKeys.filter(key => _.get(changes, key));
                if (changedKeys.length > 0) {
                  for (const key of changedKeys) {
                    values[key] = _.get(changedData, key);
                  }
                  if (running) innerListener(getResult(info, values));
                }
              });
      });
      return () => {
        running = false;
        unwatch();
        if (unlisten) unlisten();
      };
    }, listener);
  };

  const mutate = async (keys: string[], clearKeys?: string[]) => {
    let resolvePromise: (data: Data) => void;
    const promise = new Promise<Data>(resolve => (resolvePromise = resolve));
    fetcher.addMutation(
      keys.map(key => ({ key, value: noUndef(_.get(state.combined, key)) })),
      newIds => {
        set(
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

    newId: (type: string) => `$${newIds[type]++}`,

    field(field: FieldConfig, listener?: (value: FieldState) => void) {
      return watchFields(
        field,
        (info, values) => ({
          scalar: info[field.key].scalar,
          isList: info[field.key].isList as true | undefined,
          value: values[field.key],
          onChange: value => set(...field.key.split('.'), value),
          invalid: !(
            (values[field.key] === null && !info[field.key].required) ||
            validateField(
              info[field.key].scalar,
              info[field.key].rules,
              values[field.key],
              values,
            )
          ),
        }),
        listener,
      ) as any;
    },

    fields(
      fields: FieldConfig[],
      listener?: (value: { invalid: boolean; active: boolean[] }) => void,
    ) {
      return watchFields(
        fields,
        (info, values) => {
          const active = fields.map(
            ({ key }) =>
              info[key].showIf
                ? Object.keys(info[key].showIf!).every(
                    k => values[k] === info[key].showIf![k],
                  )
                : true,
          );
          const invalid = !fields.every(
            ({ key }, i) =>
              !active[i] ||
              (values[key] === null && !info[key].required) ||
              validateField(
                info[key].scalar,
                info[key].rules,
                values[key],
                values,
              ),
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
          | ((changes: DataChanges, update: boolean) => boolean)[]
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

        const unlisten = emitter.watch(({ changes, changedData, indices }) => {
          if (!indices || !indices.includes(queryIndex)) {
            if (
              !rootUpdaters ||
              rootUpdaters.some(updater => updater(changes, onChange === true))
            ) {
              rootUpdaters = null;
              updateQuery(layers, state);
            } else if (running) {
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

    set,

    mutate,
  };
}
