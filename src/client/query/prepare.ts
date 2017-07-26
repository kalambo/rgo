import {
  ArgumentNode,
  FieldNode,
  OperationDefinitionNode,
  parse,
  print,
  StringValueNode,
} from 'graphql';

import {
  Args,
  createCompare,
  Field,
  fieldIs,
  ForeignRelationField,
  getFilterFields,
  keysToObject,
  Obj,
  parseArgs,
  RelationField,
  runFilter,
} from '../../core';

import { ClientState, QueryLayer } from '../typings';

const processArgs = (
  schema: Obj<Obj<Field>>,
  variables: Obj,
  argNodes: ArgumentNode[] = [],
  type: string,
) => {
  const plainArgs = keysToObject(
    argNodes,
    ({ value }) => {
      if (value.kind === 'Variable') return variables[value.name.value];
      if (value.kind === 'IntValue') return parseInt(value.value, 10);
      return (value as StringValueNode).value;
    },
    ({ name }) => name.value,
  ) as Args;
  const args = parseArgs(plainArgs, null, schema[type]);
  return {
    ...args,
    unsorted: !plainArgs.sort,
    filterFields: getFilterFields(args.filter),
  };
};

const buildVariableArgument = (argName: string, varName?: string) =>
  ({
    kind: 'Argument',
    name: { kind: 'Name', value: argName },
    value: {
      kind: 'Variable',
      name: { kind: 'Name', value: varName || argName },
    },
  } as ArgumentNode);

const queryOperation = (keys: string[], ids?: boolean) => {
  if (keys.length === 0) {
    if (!ids) return 'query ';
    return 'query($ids: [String!]) ';
  }
  const keyVariables = keys.map(k => `$${k}: Extra`).join(', ');
  if (!ids) return `query(${keyVariables}) `;
  return `query($ids: [String!], ${keyVariables}) `;
};

export default function buildLayers(
  schema: Obj<Obj<Field>>,
  state: ClientState,
  query: string,
  variables: Obj,
  idsOnly?: boolean,
) {
  const partials: Obj<{
    query: string;
    extra: { skip: number; show: number };
    ids: string[];
  }> = {};

  const processRelation = (
    root: { type?: string; field: string },
    field: ForeignRelationField | RelationField,
    node: FieldNode,
    path: string,
  ): QueryLayer => {
    const isList = fieldIs.foreignRelation(field) || field.isList;

    const fieldNodes = node.selectionSet!.selections as FieldNode[];
    const scalarFields: Obj<true> = idsOnly
      ? { id: true }
      : keysToObject<string, true>(
          fieldNodes
            .filter(({ selectionSet }) => !selectionSet)
            .map(({ name }) => name.value),
          () => true,
        );

    const args = processArgs(schema, variables, node.arguments, field.type);
    if (isList) {
      node.arguments = [
        ...(node.arguments || []),
        buildVariableArgument('extra', path),
      ];
    }

    const allFields = Array.from(
      new Set([
        'id',
        ...((args && args.filterFields) || []),
        ...((args && args.sort.map(([f]) => f)) || []),
      ]),
    ).filter(f => !fieldNodes.some(node => node.name.value === f));
    fieldNodes.push(
      ...allFields.map(f => ({
        kind: 'Field' as 'Field',
        name: { kind: 'Name' as 'Name', value: f },
      })),
    );

    const relations = fieldNodes
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
      });

    if (isList) {
      partials[path] = {
        query: `${queryOperation(
          Object.keys(partials).filter(k => k.startsWith(path) && k !== path),
          true,
        )}{
          ${print({
            ...node,
            name: { ...node.name, value: field.type },
            arguments: [buildVariableArgument('ids')],
          })}
        }`,
        extra: { skip: 0, show: 0 },
        ids: [],
      };

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
            partials[path].ids.push(id);
            partials[path].extra.skip += 1;
            if (state.diff[field.type][id] === 0) {
              partials[path].extra.show += 1;
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
            partials[path].ids.push(id);
            partials[path].extra.show += 1;
          } else if (
            runFilter(
              args.filter,
              id,
              state.server[field.type] && state.server[field.type][id],
            )
          ) {
            partials[path].extra.show += 1;
          }
        }
      }
      partials[path].extra.skip = Math.min(
        partials[path].extra.skip,
        args.skip,
      );
    }

    const layerState = {} as any;
    return {
      root,
      field,
      args: { ...args, offset: partials[path] ? partials[path].extra.skip : 0 },
      scalarFields,
      relations,
      funcs: {
        filter: (id: string) =>
          runFilter(args.filter, id, (state.combined[field.type] || {})[id]),
        compare: createCompare(
          (id: string, key) =>
            key === 'id' ? id : state.combined[field.type][id]![key],
          args.sort,
        ),
        compareRecords: createCompare(
          (record: Obj, key) => record[key],
          args.sort,
        ),
      },
      state: layerState,
      getRecord: (id: string | null) =>
        id
          ? layerState.records[id] ||
            (layerState.records[id] = keysToObject(
              Object.keys(scalarFields),
              f => (f === 'id' ? id : state.combined[field.type][id]![f]),
            ))
          : null,
    };
  };

  const queryDoc = parse(query);
  const rootSelection = (queryDoc.definitions[0] as OperationDefinitionNode)
    .selectionSet.selections as FieldNode[];
  const layers = rootSelection.map(node =>
    processRelation(
      { field: node.name.value },
      { type: node.name.value, isList: true },
      node,
      node.name.value,
    ),
  );

  const partialsKeys = Object.keys(partials);
  const rootVariables = {
    ...variables,
    ...keysToObject(partialsKeys, path => partials[path].extra),
  };
  const requests = [
    {
      query: `${queryOperation(Object.keys(partials))}${print(queryDoc)}`,
      variables: rootVariables,
    },
    ...partialsKeys.filter(path => partials[path].ids.length > 0).map(path => ({
      query: partials[path].query,
      variables: { ...rootVariables, ids: partials[path].ids },
    })),
  ];

  return { layers, requests };
}
