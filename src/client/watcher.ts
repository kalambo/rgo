import { throttle } from 'lodash';

import { Data, fieldIs, Obj, undefOr } from '../core';

import { AuthFetch, ClientState, QueryLayer } from './typings';

const ops = { $ne: '!=', $lte: '<=', $gte: '>=', $eq: '=', $lt: '<', $gt: '>' };
const printFilter = filter => {
  const key = Object.keys(filter)[0];
  if (!key) return '';
  if (key === '$and') return `(${filter[key].map(printFilter).join(' , ')})`;
  if (key === '$or') return `(${filter[key].map(printFilter).join(' | ')})`;
  const op = Object.keys(filter[key])[0];
  return `${key} ${ops[op]} ${filter[key][op]}`;
};

export default function watcher(
  url: string,
  authFetch: AuthFetch,
  onChange: (data: Data, indices: number[]) => void,
) {
  const queryListeners: Obj<(firstIds?: Obj<Obj<string>>) => void> = {};
  const queries: Obj<string[]> = {};

  const process = throttle(
    async () => {
      const allQueries: string[] = [];
      const indices = Object.keys(queries).map(k => parseInt(k, 10));
      if (indices.length) {
        const firstIndicies: Obj<number> = {};
        for (const i of indices) {
          firstIndicies[i] = allQueries.length;
          allQueries.push(...queries[i]);
          delete queries[i];
        }
        const responses = await authFetch(
          url,
          allQueries.map(query => ({ query, normalize: true })),
        );
        onChange(responses[0].data, indices);
        for (const i of indices) {
          if (!queries[i]) {
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

    addQuery(
      queryIndex,
      onClear: () => void,
      onLoad: (firstIds?: Obj<Obj<string>>) => void,
    ): (layers?: QueryLayer[], state?: ClientState) => void {
      const prevIds: Obj<string[]> = {};
      const prevSlice: Obj<{ start: number; end?: number }> = {};
      return (layers, state) => {
        delete queries[queryIndex];
        if (!layers) {
          delete queryListeners[queryIndex];
        } else {
          let alreadyFetched = true;
          const newQueries: string[] = [];
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
                newQueries.push(`{
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
          if (!alreadyFetched) newQueries.unshift(baseQuery);
          if (newQueries.length > 0) {
            if (queryListeners[queryIndex]) onClear();
            queries[queryIndex] = newQueries;
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
  };
}
