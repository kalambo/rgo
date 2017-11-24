import { FetchInfo, fieldIs, ResolveQuery, State } from './typings';
import { getFilterFields, isEqual, isNewId, runFilter, undefOr } from './utils';

const getFields = (fields: (string | ResolveQuery | null)[]) => {
  const filtered = fields.filter(s => s) as (string | ResolveQuery)[];
  if (filtered.length === 0) return null;
  if (!filtered.includes('id')) filtered.push('id');
  return filtered;
};

export default function getRequests(
  state: State,
  info: FetchInfo,
): {
  idQueries: ResolveQuery[];
  allFields: ResolveQuery;
  newFields: ResolveQuery | null;
  trace: ResolveQuery | null;
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
      ...(fieldIs.foreignRelation(info.field) ? [info.field.foreign] : []),
    ]),
  );
  const fields = {
    old: allFields.filter(f => info.complete.data.fields.includes(f)),
    new: allFields.filter(f => !info.complete.data.fields.includes(f)),
  };
  const relationKeys = Object.keys(info.relations);
  const relations = relationKeys.map(k =>
    getRequests(state, info.relations[k]),
  );

  const idQueries = relations.reduce(
    (res, r) => [...res, ...r.idQueries],
    [] as ResolveQuery[],
  );
  const innerAll = getFields([
    ...allFields,
    ...relations.map(r => r.allFields),
  ])!;
  const innerNew = getFields([
    ...fields.new,
    ...relations.map(r => r.newFields),
  ]);
  const extra = { start: 0, end: 0 };
  const trace: { slice: { start: number; end?: number }; full: boolean } = {
    slice: { start: 0 },
    full:
      (info.complete.data.slice.start || info.complete.data.slice.end) !== 0,
  };
  if (fieldIs.foreignRelation(info.field) || info.field.isList) {
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
        isNewId(id) ||
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
              !isEqual(server[f], combined[f]),
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
    const slice = {
      start: (info.args.start || 0) - extra.start,
      end: undefOr(info.args.end, info.args.end! + extra.end),
    };
    trace.slice = info.complete.data.slice;
    trace.full =
      info.complete.data.slice.start <= slice.start &&
      (info.complete.data.slice.end === undefined ||
        (slice.end !== undefined && info.complete.data.slice.end >= slice.end));

    info.pending = {
      changing: fields.new,
      data: {
        fields: allFields,
        slice,
        ids: allIds,
      },
    };

    if (ids.new.length > 0) {
      idQueries.push({
        name: info.field.type,
        filter: ['id', 'in', ids.new],
        fields: innerAll,
      });
      info.pending.changing = allFields;
    }
    if (innerNew && ids.old.length > 0) {
      idQueries.push({
        name: info.field.type,
        filter: ['id', 'in', ids.old],
        fields: innerNew,
      });
    }
  } else {
    info.pending = {
      changing: fields.new,
      data: {
        fields: allFields,
        slice: { start: 0 },
        ids: [],
      },
    };
  }

  const innerTrace = getFields([
    ...(trace.full ? [] : fields.old),
    ...relations.map(r => r.trace),
  ]);
  if (idQueries.length === 0 && !innerNew && !innerTrace) delete info.pending;
  else if (innerTrace) info.pending.changing = allFields;
  return {
    idQueries,
    allFields: { name: info.name, ...info.args, extra, fields: innerAll },
    newFields: innerNew && {
      name: info.name,
      ...info.args,
      extra,
      fields: innerNew,
    },
    trace: innerTrace && {
      name: info.name,
      ...info.args,
      extra,
      trace: trace.slice,
      fields: innerTrace,
    },
  };
}
