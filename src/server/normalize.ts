import { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  ForeignRelationField,
  keysToObject,
  mapArray,
  Obj,
  parsePlainArgs,
  RelationField,
} from '../core';

export default function normalize(
  typeFields: Obj<Obj<Field>>,
  data: Data,
  queryDoc: DocumentNode,
  variables: Obj,
  result: Obj,
) {
  const operationNode = queryDoc.definitions[0] as OperationDefinitionNode;

  if (operationNode.operation === 'mutation') {
    const rootNodes = (operationNode.selectionSet!.selections[0] as FieldNode)
      .selectionSet!.selections as FieldNode[];
    for (const node of rootNodes) {
      const type = node.name.value;
      const fieldNodes = node.selectionSet!.selections as FieldNode[];
      const scalarFields = fieldNodes
        .filter(
          ({ name, selectionSet }) => name.value !== 'id' && !selectionSet,
        )
        .map(node => node.name.value);
      const relationFields = fieldNodes
        .filter(({ selectionSet }) => selectionSet)
        .map(node => node.name.value);

      data[type] = data[type] || {};
      result!.commit[type].forEach(
        record =>
          record &&
          (data[type][record.id] = {
            ...(data[type][record.id] || {}),
            ...keysToObject(scalarFields, f => record[f]),
            ...keysToObject(
              relationFields,
              f => record[f] && mapArray(record[f], rec => rec && rec.id),
            ),
          }),
      );
    }
    return {};
  }

  const firstIds: Obj<Obj<string>> = {};
  let idsQuery: boolean = false;

  const processLayer = (
    root: { type?: string; field: string },
    field: ForeignRelationField | RelationField,
    { arguments: argNodes, selectionSet }: FieldNode,
    queryResults: Obj<(Obj | null)[]>,
    path: string,
    variables: Obj,
  ) => {
    const fieldNodes = selectionSet!.selections as FieldNode[];
    const scalarFields = fieldNodes
      .filter(({ name, selectionSet }) => name.value !== 'id' && !selectionSet)
      .map(node => node.name.value);
    const relationFields = fieldNodes
      .filter(({ selectionSet }) => selectionSet)
      .map(node => node.name.value);
    const args = parsePlainArgs(argNodes, variables);
    if (args.ids) idsQuery = true;

    data[field.type] = data[field.type] || {};
    if (
      !idsQuery &&
      (!root.type ||
        fieldIs.foreignRelation(field) ||
        (field.isList && args.sort))
    ) {
      firstIds[path] = {};
    }
    Object.keys(queryResults).forEach(rootId => {
      if (root.type && fieldIs.relation(field) && field.isList && !args.sort) {
        if (data[root.type][rootId]![root.field]) {
          data[root.type][rootId]![root.field].unshift(args.skip || 0);
        }
      }
      queryResults[rootId].forEach(
        (record, index) =>
          record &&
          (idsQuery ||
            !args.trace ||
            args.trace.start === undefined ||
            index < args.trace.start ||
            args.trace.end === undefined ||
            index >= args.trace.end) &&
          (data[field.type][record.id] = {
            ...(data[field.type][record.id] || {}),
            ...keysToObject(scalarFields, f => record[f]),
            ...keysToObject(
              relationFields,
              f => record[f] && mapArray(record[f], rec => rec && rec.id),
            ),
          }),
      );
      if (firstIds[path]) {
        firstIds[path][rootId] = (queryResults[rootId][args.offset || 0] || {}
        ).id;
      }
    });

    fieldNodes.filter(({ selectionSet }) => selectionSet).forEach(node =>
      processLayer(
        { type: field.type, field: node.name.value },
        typeFields[field.type][node.name.value] as
          | ForeignRelationField
          | RelationField,
        node,
        Object.keys(queryResults).reduce(
          (res, rootId) => ({
            ...res,
            ...keysToObject(
              queryResults[rootId].filter(record => record) as Obj[],
              record =>
                Array.isArray(record[node.name.value])
                  ? record[node.name.value]
                  : [record[node.name.value]],
              record => record.id,
            ),
          }),
          {},
        ),
        `${path}_${node.name.value}`,
        variables,
      ),
    );
  };

  const rootNodes = operationNode.selectionSet.selections as FieldNode[];
  rootNodes.forEach(node =>
    processLayer(
      { field: node.name.value },
      { type: node.name.value, isList: true },
      node,
      { '': result![node.name.value] || [] },
      node.name.value,
      variables,
    ),
  );
  return idsQuery ? {} : { firstIds };
}
