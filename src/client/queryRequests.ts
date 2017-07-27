import { keysToObject, Obj, runFilter } from '../core';

import { ClientState, QueryLayer } from './typings';

export default function queryRequests(
  state: ClientState,
  {
    layers,
    base,
    partials,
  }: {
    layers: QueryLayer[];
    base: string;
    partials: Obj<string>;
  },
  variables: Obj,
) {
  const partialsInfo: Obj<{
    info: { extraSkip: number; extraShow: number };
    ids: string[];
  }> = {};

  const getLayerInfo = ({ field, args, relations, path }: QueryLayer) => {
    partialsInfo[path] = { info: { extraSkip: 0, extraShow: 0 }, ids: [] };
    for (const id of Object.keys(state.diff[field.type] || {})) {
      if (
        state.diff[field.type][id] === 1 ||
        state.diff[field.type][id] === 0
      ) {
        if (
          args.filterFields.some(
            f => state.combined[field.type][id]![f] === undefined,
          ) ||
          runFilter(args.filter, id, state.combined[field.type][id])
        ) {
          partialsInfo[path].ids.push(id);
          partialsInfo[path].info.extraSkip += 1;
          if (state.diff[field.type][id] === 0) {
            partialsInfo[path].info.extraShow += 1;
          }
        }
      }
      if (state.diff[field.type][id] === -1) {
        if (
          !(state.server[field.type] && state.server[field.type][id]) ||
          args.filterFields.some(
            f => state.server[field.type][id]![f] === undefined,
          )
        ) {
          partialsInfo[path].ids.push(id);
          partialsInfo[path].info.extraShow += 1;
        } else if (
          runFilter(
            args.filter,
            id,
            state.server[field.type] && state.server[field.type][id],
          )
        ) {
          partialsInfo[path].info.extraShow += 1;
        }
      }
    }
    partialsInfo[path].info.extraSkip = Math.min(
      partialsInfo[path].info.extraSkip,
      args.skip,
    );

    relations.forEach(getLayerInfo);
  };
  layers.forEach(getLayerInfo);

  const partialsKeys = Object.keys(partials);
  const rootVariables = {
    ...variables,
    ...keysToObject(partialsKeys, path => ({
      ...partialsInfo[path].info,
      traceSkip: -1,
    })),
  };
  return [
    { query: base, variables: rootVariables },
    ...partialsKeys
      .filter(path => partialsInfo[path].ids.length > 0)
      .map(path => ({
        query: partials[path],
        variables: { ...rootVariables, ids: partialsInfo[path].ids },
      })),
  ];
}
