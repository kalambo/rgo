import { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

import {
  Field,
  fieldIs,
  ForeignRelationField,
  getFilterFields,
  keysToObject,
  Obj,
  parseArgs,
  parsePlainArgs,
  RelationField,
  runFilter,
} from '../core';

import { ClientState, QueryLayer } from './typings';

export default function queryLayers(
  schema: Obj<Obj<Field>>,
  queryDoc: DocumentNode,
  variables: Obj = {},
  idsOnly?: boolean,
  addIds?: boolean,
) {
  const processRelation = (
    root: { type?: string; field: string },
    field: ForeignRelationField | RelationField,
    node: FieldNode,
    path: string,
  ): QueryLayer => {
    const fieldNodes = node.selectionSet!.selections as FieldNode[];
    const scalarFields: Obj<true> = idsOnly
      ? { id: true }
      : keysToObject<string, true>(
          fieldNodes
            .filter(({ selectionSet }) => !selectionSet)
            .map(({ name }) => name.value),
          () => true,
        );
    if (addIds) scalarFields.id = true;

    const plainArgs = parsePlainArgs(node.arguments, variables);
    const args = parseArgs(plainArgs, null, schema[field.type]);
    if (root.type && fieldIs.relation(field) && !plainArgs.sort) args.sort = [];

    const filterFields = getFilterFields(args.filter);
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
              if (state.diff[field.type][id] === 0) argsState.extra.end += 1;
              argsState.ids.push(id);
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
        argsState.extra.start = Math.min(args.start, argsState.extra.start);
      }
      return argsState;
    };

    return {
      root,
      field,
      args,
      structuralFields: [...filterFields, ...args.sort.map(([f]) => f)],
      scalarFields,
      relations: fieldNodes
        .filter(({ selectionSet }) => selectionSet)
        .map(node => {
          const schemaField = schema[field.type][node.name.value] as
            | ForeignRelationField
            | RelationField;
          return processRelation(
            { type: field.type, field: node.name.value },
            schemaField,
            node,
            `${path}_${node.name.value}`,
          );
        }),
      path,
      getArgsState,
    };
  };

  const rootSelection = (queryDoc.definitions[0] as OperationDefinitionNode)
    .selectionSet.selections as FieldNode[];
  return rootSelection.map(node =>
    processRelation(
      { field: node.name.value },
      { type: node.name.value, isList: true },
      node,
      node.name.value,
    ),
  );
}
