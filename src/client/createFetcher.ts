import * as _ from 'lodash';

import {
  allKeys,
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

export default function createFetcher(
  url: string,
  authFetch: AuthFetch,
  schema: Obj<Obj<Field>>,
  onChange: (data: Data, indices: number[]) => void,
) {
  let nextListeners: (() => void)[] = [];

  const fieldsMap: Obj<Obj<Obj<number>>> = {};
  let nextFieldsMap: Obj<Obj<Obj<true>>> = {};

  const queryListeners: Obj<(firstIds?: Obj<Obj<string>>) => void> = {};
  const nextQueries: Obj<string[]> = {};

  let mutationData: Data = {};

  const process = _.throttle(
    async () => {
      const queries: { query: string; variables?: Obj }[] = [];
      const listeners = nextListeners;
      nextListeners = [];

      for (const type of Object.keys(nextFieldsMap)) {
        for (const id of Object.keys(nextFieldsMap[type])) {
          queries.push({
            query: `{
              ${type}(ids: ["${id}"]) {
                id
                ${Object.keys(nextFieldsMap[type][id]).join('\n')}
              }
            }`,
          });
        }
      }
      nextFieldsMap = {};

      const indices = Object.keys(nextQueries).map(k => parseInt(k, 10));
      const firstIndicies: Obj<number> = {};
      for (const i of indices) {
        firstIndicies[i] = queries.length;
        queries.push(...nextQueries[i].map(query => ({ query })));
        delete nextQueries[i];
      }

      const mutationTypes = Object.keys(mutationData);
      if (mutationTypes.length > 0) {
        const mutationsArrays = keysToObject(mutationTypes, type =>
          Object.keys(mutationData[type]).map(id => ({
            id,
            ...keysToObject(Object.keys(mutationData[type][id]!), f => {
              const value = mutationData[type][id]![f];
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
                ${mutationTypes.map(
                  t => `${t} {
                  ${[
                    ...allKeys(mutationsArrays[t]),
                    ...Object.keys(schema[t]).filter(f => {
                      const field = schema[t][f];
                      return fieldIs.scalar(field)
                        ? !!field.formula
                        : fieldIs.foreignRelation(field);
                    }),
                    'modifiedat',
                  ]
                    .map(
                      f => (fieldIs.scalar(schema[t][f]) ? f : `${f} { id }`),
                    )
                    .join('\n')}
                }`,
                )}
              }
            }
          `,
          variables: mutationsArrays,
        });
      }
      mutationData = {};

      if (queries.length > 0) {
        const responses = await authFetch(
          url,
          queries.map(({ query, variables }) => ({
            query,
            variables,
            normalize: true,
          })),
        );
        onChange(responses[0].data, indices);
        for (const listener of listeners) {
          listener();
        }
        for (const i of indices) {
          if (!nextQueries[i]) {
            queryListeners[i](responses[firstIndicies[i]].firstIds);
          }
        }
      }
    },
    100,
    { leading: false },
  );

  return {
    process,

    addFields(keys: string[], onReady: () => void) {
      let alreadyLoaded = true;
      const splitKeys = keys
        .map(k => k.split('.'))
        .filter(([_, id]) => id[0] !== '$');
      for (const [type, id, field] of splitKeys) {
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
        nextListeners.push(onReady);
        process();
      } else {
        onReady();
      }
      return () => {
        for (const [type, id, field] of splitKeys) {
          fieldsMap[type][id][field]--;
        }
      };
    },

    addQuery(
      queryIndex,
      onLoad: (firstIds?: Obj<Obj<string>>) => void,
      onClear?: () => void,
    ): (layers?: QueryLayer[], state?: ClientState) => void {
      const prevIds: Obj<string[]> = {};
      const prevSlice: Obj<{ start: number; end?: number }> = {};
      return (layers, state) => {
        delete nextQueries[queryIndex];
        if (!layers) {
          delete queryListeners[queryIndex];
        } else {
          let alreadyFetched = true;
          const queries: string[] = [];
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
              const newIds = prevIds[path]
                ? ids.filter(id => !prevIds[path].includes(id))
                : ids;
              prevIds[path] = ids;
              if (ids.length > 0) {
                queries.push(`{
                  ${root.field}(ids:${JSON.stringify(newIds)}) ${inner}
                }`);
              }
              if (
                !prevSlice[path] ||
                args.start - extra.start < prevSlice[path].start ||
                (prevSlice[path].end !== undefined &&
                  (args.end === undefined ||
                    args.end + extra.end > prevSlice[path].end!))
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
                .map(k => `${k}: ${JSON.stringify(mappedArgs[k])}`);
              prevSlice[path] = { start: args.start, end: args.end };
              return `${root.field}(${printedArgs}) ${inner}`;
            }
            return `${root.field} ${inner}`;
          };
          const baseQuery = `{
            ${layers.map(processLayer).join('\n')}
          }`;
          if (!alreadyFetched) queries.unshift(baseQuery);
          if (queries.length > 0) {
            if (queryListeners[queryIndex] && onClear) onClear();
            nextQueries[queryIndex] = queries;
          } else {
            onLoad();
          }
          if (!queryListeners[queryIndex]) {
            queryListeners[queryIndex] = onLoad;
            process();
          }
        }
      };
    },

    addMutation(values: { key: string; value: any }[], onReady: () => void) {
      for (const { key, value } of values) {
        _.set(mutationData, key, value);
      }
      nextListeners.push(onReady);
      process();
    },
  };
}
