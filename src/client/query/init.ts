import { keysToObject, Obj, runFilter } from '../../core';

import { ClientState, QueryLayer } from '../typings';

export default function getRequests(
  state: ClientState,
  rootQuery: string,
  queryLayers: QueryLayer[],
  subQueries: Obj<string>,
  variables: Obj,
) {
  const layersInfo: Obj<{
    extra: {
      skip: number;
      show: number;
    };
    ids: string[];
  }> = {};
  const getLayerInfo = ({ field, path, args, relations }: QueryLayer) => {
    layersInfo[path] = { extra: { skip: 0, show: 0 }, ids: [] };
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
          layersInfo[path].ids.push(id);
          layersInfo[path].extra.skip += 1;
          if (state.diff[field.type][id] === 0) {
            layersInfo[path].extra.show += 1;
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
          layersInfo[path].ids.push(id);
          layersInfo[path].extra.show += 1;
        } else if (
          runFilter(
            args.filter,
            id,
            state.server[field.type] && state.server[field.type][id],
          )
        ) {
          layersInfo[path].extra.show += 1;
        }
      }
    }
    layersInfo[path].extra.skip = Math.min(
      layersInfo[path].extra.skip,
      args.skip,
    );
    relations.forEach(getLayerInfo);
  };
  queryLayers.forEach(getLayerInfo);

  const subQueryKeys = Object.keys(subQueries);
  const rootVariables = {
    ...variables,
    ...keysToObject(subQueryKeys, path => layersInfo[path].extra),
  };

  return {
    offsets: keysToObject(subQueryKeys, path => layersInfo[path].extra.skip),
    requests: [
      { query: rootQuery, variables: rootVariables },
      ...subQueryKeys
        .filter(path => layersInfo[path].ids.length > 0)
        .map(path => ({
          query: subQueries[path],
          variables: { ...rootVariables, ids: layersInfo[path].ids },
        })),
    ],
  };
}
