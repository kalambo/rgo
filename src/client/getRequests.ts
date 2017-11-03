import * as _ from 'lodash';

import {
  Field,
  fieldIs,
  getFilterFields,
  localPrefix,
  noUndef,
  Obj,
  printArgs,
  Query,
  queryWalker,
  runFilter,
  undefOr,
} from '../core';

import { ClientState, FetchInfo, FetchLayers } from './typings';

const layerRequests = queryWalker<
  string,
  {
    schema: Obj<Obj<Field>>;
    state: ClientState;
    fetched: FetchLayers;
    next: FetchLayers;
    alreadyFetched: boolean;
    requests: string[];
  }
>(({ root, field, args, fields, path }, context, walkRelations) => {
  const base = `${root.alias ? `${root.alias}:` : ''}${root.field}`;
  const filterFields = args.filter
    ? getFilterFields(args.filter).filter(f => f !== 'id')
    : [];
  const sortFields = args.sort
    ? args.sort.map(s => s.replace('-', '')).filter(f => f !== 'id')
    : [];
  const inner = `{
    ${Array.from(
      new Set<string>(['id', ...fields, ...filterFields, ...sortFields]),
    )
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
      const server =
        context.state.server[field.type] &&
        context.state.server[field.type][id];
      const serverStatus =
        server && filterFields.every(f => server[f] !== undefined)
          ? runFilter(args.filter, id, server)
          : null;

      const combined =
        context.state.combined[field.type] &&
        context.state.combined[field.type][id];
      const combinedStatus =
        id.startsWith(localPrefix) ||
        (combined && filterFields.every(f => combined[f] !== undefined))
          ? runFilter(args.filter, id, combined)
          : null;

      const diff = context.state.diff[field.type][id];
      if (diff === -1 || (diff === 0 && combinedStatus === false)) {
        if (serverStatus !== false) {
          slice.end += 1;
          if (serverStatus === null) ids.push(id);
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
          slice.start += 1;
          slice.end += 1;
          ids.push(id);
        }
      }
      if (diff === 1 || (diff === 0 && serverStatus === false)) {
        if (combinedStatus !== false) {
          slice.start += 1;
          if (diff === 0) ids.push(id);
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
  query: Query,
  fetched?: FetchInfo,
) {
  const requests: string[] = [];
  const fieldKeys = query.fields.map(f => JSON.stringify(f));
  const next: FetchLayers = {};
  const context = {
    schema,
    state,
    fetched:
      fetched && fieldKeys.every(f => fetched.fields.includes(f))
        ? fetched.layers
        : {},
    next,
    alreadyFetched: true,
    requests,
  };
  const baseQuery = layerRequests(query, schema, context);
  if (!context.alreadyFetched) requests.unshift(`{\n  ${baseQuery}\n}`);
  return { requests, next: { fields: fieldKeys, layers: next } };
}
