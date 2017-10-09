import * as _ from 'lodash';

import {
  Data,
  Field,
  fieldIs,
  keysToObject,
  mapArray,
  Obj,
  scalars,
  undefOr,
} from '../core';

import { AuthFetch, ClientState, QueryLayer } from './typings';

const ops = { $ne: '!=', $lte: '<=', $gte: '>=', $eq: '=', $lt: '<', $gt: '>' };
const printFilter = filter => {
  const key = Object.keys(filter)[0];
  if (!key) return '';
  if (key === '$and') return `(${filter[key].map(printFilter).join(', ')})`;
  if (key === '$or') return `(${filter[key].map(printFilter).join(' | ')})`;
  const op = Object.keys(filter[key])[0];
  return `${key}${ops[op]}${filter[key][op]}`;
};

const commitFields = (objects: Obj[], schemaType: Obj<Field>) =>
  Array.from(
    new Set([
      ...objects.reduce<string[]>((res, o) => [...res, ...Object.keys(o)], []),
      'createdat',
      'modifiedat',
    ]),
  ).map(f => (fieldIs.scalar(schemaType[f]) ? f : `${f} { id }`));

export default function createFetcher(
  authFetch: AuthFetch,
  schema: Obj<Obj<Field>>,
  authField: { type: string; field: string } | null = null,
  onChange: (data: Data, indices: number[]) => void,
) {
  const fieldsMap: Obj<Obj<Obj<number>>> = {};
  let nextFieldsMap: Obj<Obj<Obj<true>>> = {};
  let fieldsListeners: (() => void)[] = [];

  const queryListeners: Obj<(firstIds?: Obj<Obj<string>>) => void> = {};
  const prevQueries: Obj<{
    ids: Obj<string[]>;
    slice: Obj<{ start: number; end?: number }>;
  }> = {};
  const nextQueries: Obj<{
    ids: Obj<string[]>;
    slice: Obj<{ start: number; end?: number }>;
    queries: string[];
  }> = {};

  let commitData: Data = {};
  let commitListeners: ((
    newIds?: Obj<Obj<string>>,
    error?: boolean,
  ) => void)[] = [];

  const process = _.throttle(
    async () => {
      const currentFieldsListeners = fieldsListeners;
      fieldsListeners = [];
      const queries: { query: string; variables?: Obj }[] = [];
      const currentMutationListeners = commitListeners;
      commitListeners = [];

      const indices = Object.keys(nextQueries).map(k => parseInt(k, 10));
      const firstIndicies: Obj<number> = {};
      for (const i of indices) {
        if (nextQueries[i].queries.length > 0) {
          firstIndicies[i] = queries.length;
          queries.push(...nextQueries[i].queries.map(query => ({ query })));
          prevQueries[i] = {
            ids: nextQueries[i].ids,
            slice: nextQueries[i].slice,
          };
        }
        delete nextQueries[i];
      }

      for (const type of Object.keys(nextFieldsMap)) {
        for (const id of Object.keys(nextFieldsMap[type])) {
          queries.push({
            query: `{
              ${type}(filter: "id=${id}") {
                id
                ${Object.keys(nextFieldsMap[type][id])
                  .map(
                    f => (fieldIs.scalar(schema[type][f]) ? f : `${f} { id }`),
                  )
                  .join('\n')}
              }
            }`,
          });
        }
      }
      nextFieldsMap = {};

      const mutationTypes = Object.keys(commitData);
      if (mutationTypes.length > 0) {
        const mutationsArrays = keysToObject(mutationTypes, type =>
          Object.keys(commitData[type]).map(id => ({
            id,
            ...keysToObject(Object.keys(commitData[type][id]!), f => {
              const value = commitData[type][id]![f];
              const field = schema[type][f];
              const encode =
                fieldIs.scalar(field) && scalars[field.scalar].encode;
              return value === null || !encode
                ? value
                : mapArray(value, encode);
            }),
          })),
        );
        queries.push({
          query: `
            mutation Mutate(${mutationTypes
              .map(t => `$${t}: [${t}Input!]`)
              .join(', ')}) {
              mutate(${mutationTypes.map(t => `${t}: $${t}`).join(', ')}) {
                ${mutationTypes
                  .map(
                    t => `${t} {
                      ${commitFields(mutationsArrays[t], schema[t]).join('\n')}
                    }`,
                  )
                  .join('\n')}
              }
            }
          `,
          variables: mutationsArrays,
        });
      }
      commitData = {};

      if (queries.length > 0) {
        const responses = await authFetch(
          queries.map(({ query, variables }) => ({
            query,
            variables,
            normalize: true,
          })),
        );
        onChange(responses[0].data, indices);
        for (const listener of currentFieldsListeners) {
          listener();
        }
        for (const i of indices) {
          if (!nextQueries[i] && firstIndicies[i] !== undefined) {
            queryListeners[i](responses[firstIndicies[i]].firstIds);
          }
        }
        const mutationError = !!responses[responses.length - 1].errors;
        for (const listener of currentMutationListeners) {
          listener(
            mutationError ? undefined : responses[0].newIds,
            mutationError,
          );
        }
      }
    },
    100,
    { leading: false },
  );

  return {
    process,

    addFields(
      keys: [string, string, string][],
      onReady: (isLoading?: boolean) => void,
    ) {
      let alreadyLoaded = true;
      const serverKeys = keys.filter(([_, id]) => id[0] !== '$');
      for (const [type, id, field] of serverKeys) {
        fieldsMap[type] = fieldsMap[type] || {};
        fieldsMap[type][id] = fieldsMap[type][id] || {};
        if (!fieldsMap[type][id][field]) {
          alreadyLoaded = false;
          fieldsMap[type][id][field] = 0;
          nextFieldsMap[type] = nextFieldsMap[type] || {};
          nextFieldsMap[type][id] = nextFieldsMap[type][id] || {};
          nextFieldsMap[type][id][field] = true;
        }
        fieldsMap[type][id][field]++;
      }
      if (!alreadyLoaded) {
        fieldsListeners.push(onReady);
        onReady(true);
        process();
      } else {
        onReady();
      }
      return () => {
        for (const [type, id, field] of serverKeys) {
          fieldsMap[type][id][field]--;
        }
      };
    },

    addQuery(
      queryIndex,
      onLoad: (firstIds?: Obj<Obj<string>>) => void,
      onClear: () => void,
    ): (layers?: QueryLayer[], state?: ClientState) => void {
      return (layers, state) => {
        if (!layers) {
          delete queryListeners[queryIndex];
          delete prevQueries[queryIndex];
          delete nextQueries[queryIndex];
        } else {
          nextQueries[queryIndex] = { ids: {}, slice: {}, queries: [] };
          let alreadyFetched = true;
          const processLayer = ({
            root,
            field,
            args,
            structuralFields,
            scalarFields,
            relations,
            path,
            getArgsState,
          }: QueryLayer) => {
            const fields = Array.from(
              new Set([
                'id',
                ...Object.keys(scalarFields),
                ...structuralFields,
              ]),
            );
            const inner = `{
              ${fields.join('\n')}
              ${relations.map(processLayer).join('\n')}
            }`;
            if (fieldIs.foreignRelation(field) || field.isList) {
              const { extra, ids } = getArgsState(state!);
              const prev = prevQueries[queryIndex] || { ids: {}, slice: {} };
              const newIds = prev.ids[path]
                ? ids.filter(id => !prev.ids[path].includes(id))
                : ids;
              nextQueries[queryIndex].ids[path] = ids;
              if (newIds.length > 0) {
                nextQueries[queryIndex].queries.push(`{
                  ${root.field}(ids:${JSON.stringify(newIds)}) ${inner}
                }`);
              }
              if (
                !prev.slice[path] ||
                args.start - extra.start < prev.slice[path].start ||
                (prev.slice[path].end !== undefined &&
                  (args.end === undefined ||
                    args.end + extra.end > prev.slice[path].end!))
              ) {
                alreadyFetched = false;
              }
              const mappedArgs = {
                filter: printFilter(args.filter),
                sort: args.sort
                  .map(([k, dir]) => (dir === 'asc' ? k : `-${k}`))
                  .join(', '),
                skip: args.start - extra.start,
                show: undefOr(
                  args.end,
                  args.end! - args.start + extra.start + extra.end,
                ),
                offset: extra.start,
                trace: args.trace,
              };
              const printedArgs = Object.keys(mappedArgs)
                .filter(k => mappedArgs[k] !== undefined)
                .map(
                  k =>
                    `${k}: ${JSON.stringify(mappedArgs[k]).replace(
                      /\"([^(\")"]+)\":/g,
                      '$1:',
                    )}`,
                );
              nextQueries[queryIndex].slice[path] = {
                start: args.start,
                end: args.end,
              };
              return `${root.field}(${printedArgs}) ${inner}`;
            }
            return `${root.field} ${inner}`;
          };
          const baseQuery = `{
            ${layers.map(processLayer).join('\n')}
          }`;
          if (!alreadyFetched) {
            nextQueries[queryIndex].queries.unshift(baseQuery);
          }
          if (prevQueries[queryIndex]) {
            if (nextQueries[queryIndex].queries.length > 0) onClear();
            else onLoad();
          }
          if (!queryListeners[queryIndex]) {
            queryListeners[queryIndex] = onLoad;
            onClear();
            process();
          }
        }
      };
    },

    addCommit(
      values: { key: [string, string, string]; value: any }[],
      onReady: (newIds?: Obj<Obj<string>>, error?: boolean) => void,
    ) {
      let commitValues = values;
      if (authField) {
        const indices = { username: -1, password: -1 };
        values.forEach(({ key: [type, _, field] }, i) => {
          if (type === authField.type) {
            if (field === authField.field) indices.username = i;
            if (field === 'password') indices.password = i;
          }
        });
        if (indices.username !== -1 || indices.password !== -1) {
          commitValues = [
            ...values.filter(
              (_, i) => i !== indices.username && i !== indices.password,
            ),
            {
              key: [
                authField.type,
                values[indices.username].key[1] ||
                  values[indices.password].key[1],
                authField.field,
              ],
              value: JSON.stringify({
                username: values[indices.username].value,
                password: values[indices.password].value,
              }),
            },
          ];
        }
      }
      for (const { key, value } of commitValues) {
        _.set(commitData, key, value);
      }
      commitListeners.push(onReady);
      process();
    },
  };
}
