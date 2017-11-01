import {
  Field,
  fieldIs,
  getFilterFields,
  Obj,
  printArgs,
  Query,
  queryWalker,
  runFilter,
  undefOr,
} from '../core';

import { ClientState } from './typings';

const layerRequests = queryWalker<
  string,
  {
    schema: Obj<Obj<Field>>;
    state: ClientState;
    fetched: Obj<{
      slice: { start: number; end?: number };
      ids: string[];
    }>;
    next: Obj<{
      slice: { start: number; end?: number };
      ids: string[];
    }>;
    alreadyFetched: boolean;
    requests: string[];
  }
>(({ root, field, args, fields, path }, context, walkRelations) => {
  const base = `${root.alias ? `${root.alias}:` : ''}${root.field}`;
  const filterFields = args.filter ? getFilterFields(args.filter) : [];
  const inner = `{
    ${Array.from(
      new Set<string>([
        'id',
        ...fields,
        ...filterFields,
        ...(args.sort ? args.sort.map(s => s.replace('-', '')) : []),
      ]),
    )
      .filter(f => f !== 'password')
      .map(
        f =>
          fieldIs.scalar(context.schema[field.type][f]) ? f : `${f} {\nid\n}`,
      )
      .join('\n')}
    ${walkRelations().join('\n')}
  }`;
  if (fieldIs.foreignRelation(field) || field.isList) {
    const slice = { start: 0, end: 0 };
    const ids: string[] = [];
    for (const id of Object.keys(context.state.diff[field.type] || {})) {
      if (
        context.state.diff[field.type][id] === 1 ||
        context.state.diff[field.type][id] === 0
      ) {
        if (
          filterFields.some(
            f => context.state.combined[field.type][id]![f] === undefined,
          ) ||
          runFilter(args.filter, id, context.state.combined[field.type][id])
        ) {
          slice.start += 1;
          if (context.state.diff[field.type][id] === 0) {
            slice.end += 1;
            ids.push(id);
          }
        }
      }
      if (context.state.diff[field.type][id] === -1) {
        if (
          !(
            context.state.server[field.type] &&
            context.state.server[field.type][id]
          ) ||
          filterFields.some(
            f => context.state.server[field.type][id]![f] === undefined,
          )
        ) {
          slice.end += 1;
          ids.push(id);
        } else if (
          runFilter(
            args.filter,
            id,
            context.state.server[field.type] &&
              context.state.server[field.type][id],
          )
        ) {
          slice.end += 1;
        }
      }
    }
    slice.start = Math.min(args.start || 0, slice.start);

    const pathKey = path.join('_');
    if (
      !context.fetched[pathKey] ||
      (args.start || 0) - slice.start < context.fetched[pathKey].slice.start ||
      (context.fetched[pathKey].slice.end !== undefined &&
        (args.end === undefined ||
          args.end + slice.end > context.fetched[pathKey].slice.end!))
    ) {
      context.alreadyFetched = false;
    }
    const requestArgs = printArgs(
      {
        ...args,
        start: (args.start || 0) - slice.start,
        end: undefOr(args.end, args.end! + slice.end),
        offset: slice.start,
        trace: context.fetched[pathKey] && context.fetched[pathKey].slice,
      },
      context.schema[field.type],
    );
    const newIds = context.fetched[pathKey]
      ? ids.filter(id => !context.fetched[pathKey].ids.includes(id))
      : ids;
    if (newIds.length > 0) {
      const idsArgs = printArgs(
        { filter: ['id', 'in', newIds] },
        context.schema[field.type],
      );
      context.requests.push(`{
        ${root.field}${idsArgs} ${inner}
      }`);
    }
    context.next[pathKey] = {
      slice: {
        start: (args.start || 0) - slice.start,
        end: undefOr(args.end, args.end! + slice.end),
      },
      ids,
    };
    return `${base}${requestArgs} ${inner}`;
  }
  return `${base} ${inner}`;
});

export default function getRequests(
  schema: Obj<Obj<Field>>,
  state: ClientState,
  queries: Query[],
  fetched: Obj<{
    slice: { start: number; end?: number };
    ids: string[];
  }>,
) {
  const requests: string[] = [];
  const next: Obj<{
    slice: { start: number; end?: number };
    ids: string[];
  }> = {};
  const baseQueries = queries
    .map(query => {
      const context = {
        schema,
        state,
        fetched,
        next,
        alreadyFetched: true,
        requests,
      };
      const result = layerRequests(query, schema, context);
      return context.alreadyFetched ? '' : result;
    })
    .filter(r => r);
  if (baseQueries.length > 0) {
    requests.unshift(`{
      ${baseQueries.join('\n')}
    }`);
  }
  return { requests, next };
}
