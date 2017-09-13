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

const mutationFields = (mutations: Obj[], schemaType: Obj<Field>) =>
  [
    ...Array.from(
      new Set(
        mutations.reduce<string[]>((res, o) => [...res, ...Object.keys(o)], []),
      ),
    ),
    ...Object.keys(schemaType).filter(f => {
      const field = schemaType[f];
      return fieldIs.foreignRelation(field);
    }),
    'modifiedat',
  ].map(f => (fieldIs.scalar(schemaType[f]) ? f : `${f} { id }`));

export default function createFetcher(
  url: string,
  authFetch: AuthFetch,
  schema: Obj<Obj<Field>>,
  onChange: (data: Data, indices: number[]) => void,
) {
  let nextListeners: ((newIds?: Obj<Obj<string>>) => void)[] = [];

  const fieldsMap: Obj<Obj<Obj<number>>> = {};
  let nextFieldsMap: Obj<Obj<Obj<true>>> = {};

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
        queries.push(...nextQueries[i].queries.map(query => ({ query })));
        prevQueries[i] = {
          ids: nextQueries[i].ids,
          slice: nextQueries[i].slice,
        };
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
                ${mutationTypes
                  .map(
                    t => `${t} {
                      ${mutationFields(mutationsArrays[t], schema[t]).join(
                        '\n',
                      )}
                    }`,
                  )
                  .join('\n')}
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
          listener(responses[0].newIds);
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

    addFields(keys: string[], onReady: (isLoading?: boolean) => void) {
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
        nextListeners.push(() => onReady());
        onReady(true);
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
              if (ids.length > 0) {
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
                .map(k => `${k}: ${JSON.stringify(mappedArgs[k])}`);
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

    addMutation(
      values: { key: string; value: any }[],
      onReady: (newIds: Obj<Obj<string>>) => void,
    ) {
      for (const { key, value } of values) {
        _.set(mutationData, key, value);
      }
      nextListeners.push(onReady);
      process();
    },
  };
}
