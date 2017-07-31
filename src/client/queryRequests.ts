import { Obj, runFilter } from '../core';

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
  trace: Obj<{ skip: number; show: number | null }>,
  ids: Obj<string[]>,
) {
  const partialsSlice: Obj<{ skip: number; show: number | null }> = {};
  const partialsInfo: Obj<{ extraSkip: number; extraShow: number }> = {};
  const partialsIds: Obj<string[]> = {};

  const getLayerInfo = ({ field, args, relations, path }: QueryLayer) => {
    partialsSlice[path] = { skip: args.skip, show: args.show };
    partialsInfo[path] = { extraSkip: 0, extraShow: 0 };
    partialsIds[path] = [];
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
          partialsInfo[path].extraSkip += 1;
          if (state.diff[field.type][id] === 0) {
            partialsInfo[path].extraShow += 1;
          }
          partialsIds[path].push(id);
        }
      }
      if (state.diff[field.type][id] === -1) {
        if (
          !(state.server[field.type] && state.server[field.type][id]) ||
          args.filterFields.some(
            f => state.server[field.type][id]![f] === undefined,
          )
        ) {
          partialsInfo[path].extraShow += 1;
          partialsIds[path].push(id);
        } else if (
          runFilter(
            args.filter,
            id,
            state.server[field.type] && state.server[field.type][id],
          )
        ) {
          partialsInfo[path].extraShow += 1;
        }
      }
    }
    partialsInfo[path].extraSkip = Math.min(
      partialsInfo[path].extraSkip,
      args.skip,
    );
    const newIds = partialsIds[path];
    partialsIds[path] = ids[path]
      ? partialsIds[path].filter(id => !ids[path].includes(id))
      : partialsIds[path];
    ids[path] = newIds;

    relations.forEach(getLayerInfo);
  };
  layers.forEach(getLayerInfo);

  const partialsKeys = Object.keys(partials);

  const baseVariables = { ...variables, ...partialsInfo };
  let isTraceComplete = true;
  partialsKeys.forEach(path => {
    if (trace[path]) {
      baseVariables[path].traceSkip = trace[path].skip;
      baseVariables[path].traceShow = trace[path].show;
    }
    const newTrace = {
      skip: partialsSlice[path].skip - partialsInfo[path].extraSkip,
      show:
        partialsSlice[path].show !== null
          ? partialsSlice[path].show! +
            partialsInfo[path].extraSkip +
            partialsInfo[path].extraShow
          : null,
    };
    if (
      !trace[path] ||
      (newTrace.skip >= trace[path].skip &&
        (trace[path].show === null ||
          (newTrace.show !== null && newTrace.show <= trace[path].show!)))
    ) {
      isTraceComplete = false;
    }
    trace[path] = newTrace;
  });

  const partialVariables = { ...variables, ...partialsInfo };

  return [
    ...(!isTraceComplete
      ? [{ query: base, variables: { ...variables, ...partialsInfo } }]
      : []),
    ...partialsKeys.filter(path => partialsIds[path].length > 0).map(path => ({
      query: partials[path],
      variables: { ...partialVariables, ids: partialsIds[path] },
    })),
  ];
}
