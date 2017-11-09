import * as _ from 'lodash';

import {
  Args,
  Field,
  fieldIs,
  getFilterFields,
  localPrefix,
  noUndef,
  Obj,
  RequestQuery,
  runFilter,
  undefOr,
} from '../core';

import { ClientState, FetchInfo } from './typings';

const getFields = (fields: (string | RequestQuery | null)[]) => {
  const filtered = fields.filter(s => s) as (string | RequestQuery)[];
  if (filtered.length === 0) return null;
  if (!filtered.includes('id')) filtered.push('id');
  return filtered;
};

export default function getRequests(
  schema: Obj<Obj<Field>>,
  state: ClientState,
  info: FetchInfo,
): {
  idQueries: RequestQuery[];
  allFields: RequestQuery;
  newFields: RequestQuery | null;
  trace: RequestQuery | null;
} {
  const filterFields = info.args.filter
    ? getFilterFields(info.args.filter).filter(f => f !== 'id')
    : [];
  const sortFields = info.args.sort
    ? info.args.sort.map(s => s.replace('-', '')).filter(f => f !== 'id')
    : [];
  const allFields = Array.from(
    new Set<string>([
      'id',
      ...Object.keys(info.fields),
      ...filterFields,
      ...sortFields,
    ]),
  ).map(
    f => (fieldIs.scalar(schema[info.field.type][f]) ? f : `${f} {\nid\n}`),
  );
  const fields = {
    old: allFields.filter(f => info.complete.data.fields.includes(f)),
    new: allFields.filter(f => !info.complete.data.fields.includes(f)),
  };
  const relationKeys = Object.keys(info.relations);
  const relations = relationKeys.map(k =>
    getRequests(schema, state, info.relations[k]),
  );

  const idQueries = relations.reduce(
    (res, r) => [...res, ...r.idQueries],
    [] as RequestQuery[],
  );
  const innerAll = getFields([
    ...allFields,
    ...relations.map(r => r.allFields),
  ])!;
  const innerNew = getFields([
    ...fields.new,
    ...relations.map(r => r.newFields),
  ]);
  const args = {
    base: {} as Args,
    trace: { start: 0 } as { start: number; end?: number },
    traceIsFull:
      (info.complete.data.slice.start || info.complete.data.slice.end) !== 0,
  };
  if (fieldIs.foreignRelation(info.field) || info.field.isList) {
    const extra = { start: 0, end: 0 };
    const allIds: string[] = [];
    for (const id of Object.keys(state.diff[info.field.type] || {})) {
      const server =
        state.server[info.field.type] && state.server[info.field.type][id];
      const serverStatus =
        server && filterFields.every(f => server[f] !== undefined)
          ? runFilter(info.args.filter, id, server)
          : null;

      const combined =
        state.combined[info.field.type] && state.combined[info.field.type][id];
      const combinedStatus =
        id.startsWith(localPrefix) ||
        (combined && filterFields.every(f => combined[f] !== undefined))
          ? runFilter(info.args.filter, id, combined)
          : null;

      const diff = state.diff[info.field.type][id];
      if (diff === -1 || (diff === 0 && combinedStatus === false)) {
        if (serverStatus !== false) {
          extra.end += 1;
          if (serverStatus === null) allIds.push(id);
        }
      }
      if (diff === 0) {
        if (
          serverStatus === null ||
          combinedStatus === null ||
          sortFields.some(
            f =>
              server[f] === undefined ||
              (combined[f] || server[f]) === undefined ||
              !_.isEqual(noUndef(server[f]), noUndef(combined[f])),
          )
        ) {
          extra.start += 1;
          extra.end += 1;
          allIds.push(id);
        }
      }
      if (diff === 1 || (diff === 0 && serverStatus === false)) {
        if (combinedStatus !== false) {
          extra.start += 1;
          if (diff === 0) allIds.push(id);
        }
      }
    }
    extra.start = Math.min(info.args.start || 0, extra.start);

    const ids = {
      old: allIds.filter(id => info.complete.data.ids.includes(id)),
      new: allIds.filter(id => !info.complete.data.ids.includes(id)),
    };
    args.base = {
      ...info.args,
      start: (info.args.start || 0) - extra.start,
      end: undefOr(info.args.end, info.args.end! + extra.end),
    };
    args.trace = info.complete.data.slice;
    args.traceIsFull =
      info.complete.data.slice.start <= args.base.start! &&
      (info.complete.data.slice.end === undefined ||
        (args.base.end !== undefined &&
          info.complete.data.slice.end >= args.base.end));

    info.pending = {
      changing: fields.new,
      offset: extra.start,
      data: {
        fields: allFields,
        slice: {
          start: args.base.start!,
          end: args.base.end,
        },
        ids: allIds,
      },
    };

    if (ids.new.length > 0) {
      idQueries.push({
        name: info.name,
        filter: ['id', 'in', ids.new],
        fields: innerAll,
      });
      info.pending!.changing = allFields;
    }
    if (innerNew && ids.old.length > 0) {
      idQueries.push({
        name: info.name,
        filter: ['id', 'in', ids.old],
        fields: innerNew,
      });
    }
  } else {
    info.pending = {
      changing: fields.new,
      offset: 0,
      data: {
        fields: allFields,
        slice: { start: 0 },
        ids: [],
      },
    };
  }

  const innerTrace = getFields([
    ...(args.traceIsFull ? [] : fields.old),
    ...relations.map(r => r.trace),
  ]);
  if (idQueries.length === 0 && !innerNew && !innerTrace) delete info.pending;
  else if (innerTrace) info.pending.changing = allFields;
  return {
    idQueries,
    allFields: { name: info.name, ...args.base, fields: innerAll },
    newFields: innerNew && { name: info.name, ...args.base, fields: innerNew },
    trace: innerTrace && {
      name: info.name,
      ...args.base,
      trace: args.trace,
      fields: innerTrace,
    },
  };
}
