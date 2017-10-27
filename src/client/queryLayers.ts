import {
  Args,
  Field,
  fieldIs,
  ForeignRelationField,
  keysToObject,
  Obj,
  Query,
  RelationField,
  runFilter,
} from '../core';

import { ClientState, QueryLayer } from './typings';

export const getFilterFields = (filter: any[]): string[] => {
  if (['and', 'or'].includes(filter[0].toLowerCase())) {
    return filter
      .slice(1)
      .reduce((res, f) => [...res, ...getFilterFields(f)], []);
  }
  return [filter[0]];
};

export default function queryLayers(schema: Obj<Obj<Field>>, query: Query[]) {
  const processRelation = (
    root: { type?: string; field: string; alias?: string },
    field: ForeignRelationField | RelationField,
    args: Args,
    fields: (string | Query)[],
    path: string,
  ): QueryLayer => {
    if (args.filter && !Array.isArray(args.filter)) {
      args.filter = ['id', args.filter];
    }
    if (args.sort && !Array.isArray(args.sort)) {
      args.sort = [args.sort];
    }

    const scalarFields: Obj<true> = keysToObject<true>(
      fields.filter(f => typeof f === 'string'),
      true,
    );

    if (!root.type || fieldIs.foreignRelation(field)) {
      args.sort = args.sort || [];
    }
    if (args.sort) {
      if (!args.sort.some(s => s.replace('-', '') === 'createdat')) {
        args.sort.push('-createdat');
      }
      if (!args.sort.some(s => s.replace('-', '') === 'id')) {
        args.sort.push('id');
      }
    }

    const filterFields = args.filter ? getFilterFields(args.filter) : [];
    const argsState = { extra: { start: 0, end: 0 }, ids: [] as string[] };
    const getArgsState = (state?: ClientState) => {
      if (state) {
        argsState.extra = { start: 0, end: 0 };
        argsState.ids = [];
        for (const id of Object.keys(state.diff[field.type] || {})) {
          if (
            state.diff[field.type][id] === 1 ||
            state.diff[field.type][id] === 0
          ) {
            if (
              filterFields.some(
                f => state.combined[field.type][id]![f] === undefined,
              ) ||
              runFilter(args.filter, id, state.combined[field.type][id])
            ) {
              argsState.extra.start += 1;
              if (state.diff[field.type][id] === 0) {
                argsState.extra.end += 1;
                argsState.ids.push(id);
              }
            }
          }
          if (state.diff[field.type][id] === -1) {
            if (
              !(state.server[field.type] && state.server[field.type][id]) ||
              filterFields.some(
                f => state.server[field.type][id]![f] === undefined,
              )
            ) {
              argsState.extra.end += 1;
              argsState.ids.push(id);
            } else if (
              runFilter(
                args.filter,
                id,
                state.server[field.type] && state.server[field.type][id],
              )
            ) {
              argsState.extra.end += 1;
            }
          }
        }
        argsState.extra.start = Math.min(
          args.start || 0,
          argsState.extra.start,
        );
      }
      return argsState;
    };

    return {
      root,
      field,
      args,
      structuralFields: Array.from(
        new Set([
          ...filterFields,
          ...(args.sort || []).map(s => s.replace('-', '')),
        ]),
      ),
      scalarFields,
      relations: fields
        .filter(f => typeof f !== 'string')
        .map(({ name, alias, fields, ...args }: Query) => {
          const schemaField = schema[field.type][name] as
            | ForeignRelationField
            | RelationField;
          return processRelation(
            { type: field.type, field: name, alias },
            schemaField,
            args as Args,
            fields,
            `${path}_${alias || name}`,
          );
        }),
      path,
      getArgsState,
    };
  };

  return query.map(({ name, alias, fields, ...args }) =>
    processRelation(
      { field: name, alias },
      { type: name, isList: true },
      args as Args,
      fields,
      alias || name,
    ),
  );
}
