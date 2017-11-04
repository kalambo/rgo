import * as _ from 'lodash';

import {
  Field,
  fieldIs,
  FullArgs,
  getFilterFields,
  localPrefix,
  noUndef,
  Obj,
  printArgs,
  runFilter,
  undefOr,
} from '../core';

import { ClientState, FetchInfo } from './typings';

const printFields = (fields: string[]) => {
  const filtered = fields.filter(s => s);
  if (filtered.length > 0 && !filtered.includes('id')) filtered.push('id');
  return filtered.join('\n');
};

export default function getRequests(
  schema: Obj<Obj<Field>>,
  state: ClientState,
  info: FetchInfo,
  index,
): {
  idQueries: string[];
  allFields: string;
  newFields: string;
  trace: string;
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
    old: allFields.filter(f => info.fetched && info.fetched.fields.includes(f)),
    new: allFields.filter(
      f => !(info.fetched && info.fetched.fields.includes(f)),
    ),
  };
  const relationKeys = Object.keys(info.relations);
  const relations = relationKeys.map((k, i) =>
    getRequests(schema, state, info.relations[k], i),
  );

  info.changing = fields.new;
  const idQueries = relations.reduce(
    (res, r) => [...res, ...r.idQueries],
    [] as string[],
  );
  const innerAll = printFields([
    ...allFields,
    ...relations.map(r => r.allFields),
  ]);
  const innerNew = printFields([
    ...fields.new,
    ...relations.map(r => r.newFields),
  ]);
  const args = { base: '', trace: '', traceIsFull: !!info.fetched };
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
      old: info.fetched
        ? allIds.filter(id => info.fetched!.ids.includes(id))
        : [],
      new: info.fetched
        ? allIds.filter(id => !info.fetched!.ids.includes(id))
        : allIds,
    };
    const baseArgs: FullArgs<string> = {
      ...info.args,
      start: (info.args.start || 0) - extra.start,
      end: undefOr(info.args.end, info.args.end! + extra.end),
      offset: extra.start,
    };
    args.base = printArgs(baseArgs, schema[info.field.type]);
    args.trace = printArgs(
      { ...baseArgs, trace: info.fetched && info.fetched.slice },
      schema[info.field.type],
    );
    args.traceIsFull =
      !!info.fetched &&
      info.fetched.slice.start <= baseArgs.start! &&
      (info.fetched.slice.end === undefined ||
        (baseArgs.end !== undefined && info.fetched.slice.end >= baseArgs.end));

    info.index = index;
    info.next = {
      fields: allFields,
      slice: {
        start: baseArgs.start!,
        end: baseArgs.end,
      },
      ids: allIds,
    };

    if (ids.new.length > 0) {
      const printedArgs = printArgs(
        { filter: ['id', 'in', ids.new] },
        schema[info.field.type],
      );
      idQueries.push(`${info.name}${printedArgs} {\n  ${innerAll}\n}`);
      info.changing = allFields;
    }
    if (innerNew && ids.old.length > 0) {
      const printedArgs = printArgs(
        { filter: ['id', 'in', ids.old] },
        schema[info.field.type],
      );
      idQueries.push(`${info.name}${printedArgs} {\n  ${innerNew}\n}`);
    }
  } else {
    info.next = { fields: allFields, slice: { start: 0 }, ids: [] };
  }

  const innerTrace = printFields([
    ...(args.traceIsFull ? [] : fields.old),
    ...relations.map(r => r.trace),
  ]);
  if (innerTrace) info.changing = allFields;
  return {
    idQueries,
    allFields: `a${index}:${info.name}${args.base} {\n  ${innerAll}\n}`,
    newFields:
      innerNew && `b${index}:${info.name}${args.base} {\n  ${innerNew}\n}`,
    trace:
      innerTrace &&
      `${innerNew
        ? 'c'
        : 'b'}${index}:${info.name}${args.trace} {\n  ${innerTrace}\n}`,
  };
}
