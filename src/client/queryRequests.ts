import { Obj, runFilter, undefOr } from '../core';

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
  trace: Obj<{ start: number; end?: number }>,
  ids: Obj<string[]>,
) {
  const partialsSlice: Obj<{ start: number; end?: number }> = {};
  const partialsInfo: Obj<{ extraSkip: number; extraShow: number }> = {};
  const partialsIds: Obj<string[]> = {};

  const getLayerInfo = ({ field, args, relations, path }: QueryLayer) => {
    partialsSlice[path] = { start: args.start, end: args.end };
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
      args.start,
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
  let alreadyFetched = true;
  partialsKeys.forEach(path => {
    if (trace[path]) {
      baseVariables[path].traceStart = trace[path].start;
      baseVariables[path].traceEnd = trace[path].end;
    }
    const newTrace = {
      start: partialsSlice[path].start - partialsInfo[path].extraSkip,
      end: undefOr(
        partialsSlice[path].end,
        partialsSlice[path].end! + partialsInfo[path].extraShow,
      ),
    };
    if (
      !trace[path] ||
      newTrace.start < trace[path].start ||
      (trace[path].end !== undefined &&
        (newTrace.end === undefined || newTrace.end > trace[path].end!))
    ) {
      alreadyFetched = false;
    }
    trace[path] = newTrace;
  });

  const partialVariables = { ...variables, ...partialsInfo };

  return [
    ...(!alreadyFetched
      ? [{ query: base, variables: { ...variables, ...partialsInfo } }]
      : []),
    ...partialsKeys.filter(path => partialsIds[path].length > 0).map(path => ({
      query: partials[path],
      variables: { ...partialVariables, ids: partialsIds[path] },
    })),
  ];
}
