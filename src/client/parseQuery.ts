import {
  ArgumentNode,
  FieldNode,
  OperationDefinitionNode,
  parse,
  print,
} from 'graphql';

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
} from '../core';

import { QueryLayer } from './typings';

const processArgs = (
  schema: Obj<Obj<Field>>,
  variables: Obj,
  argNodes: ArgumentNode[] = [],
  type: string,
) => {
  const plainArgs = parsePlainArgs(argNodes, variables);
  const args = parseArgs(plainArgs, null, schema[type]);
  const filterFields = getFilterFields(args.filter);
  return {
    ...args,
    unsorted: !plainArgs.sort,
    filterFields,
    structuralFields: [...filterFields, ...args.sort.map(([f]) => f)],
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
  const keyVariables = keys.map(k => `$${k}: Info`).join(', ');
  if (!ids) return `query(${keyVariables}) `;
  return `query($ids: [String!], ${keyVariables}) `;
};

export default function parseQuery(
  schema: Obj<Obj<Field>>,
  query: string,
  variables: Obj = {},
  idsOnly?: boolean,
) {
  const partials: Obj<string> = {};

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
        buildVariableArgument('info', path),
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
      partials[path] = `${queryOperation(
        Object.keys(partials).filter(k => k.startsWith(path) && k !== path),
        true,
      )}{
        ${print({
          ...node,
          name: { ...node.name, value: field.type },
          arguments: [buildVariableArgument('ids')],
        })}
      }`;
    }

    return {
      root,
      field,
      args,
      scalarFields,
      relations,
      path,
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

  return {
    layers,
    base: `${queryOperation(Object.keys(partials))}${print(queryDoc)}`,
    partials,
  };
}
