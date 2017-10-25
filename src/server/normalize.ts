import {
  DocumentNode,
  FieldNode,
  GraphQLInputType,
  OperationDefinitionNode,
  valueFromAST,
} from 'graphql';

import {
  Data,
  Field,
  fieldIs,
  ForeignRelationField,
  FullArgs,
  keysToObject,
  mapArray,
  Obj,
  RelationField,
} from '../core';

const toArray = (x: any) => (Array.isArray(x) ? x : [x]);

export default function normalize(
  typeFields: Obj<Obj<Field>>,
  data: Data,
  queryDoc: DocumentNode,
  argTypes: Obj<{ type: GraphQLInputType }>,
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

  const processLayer = (
    root: { type?: string; field: string },
    field: ForeignRelationField | RelationField,
    { arguments: argNodes, selectionSet }: FieldNode,
    queryResults: Obj<(Obj | null)[]>,
    path: string,
  ) => {
    const fieldNodes = selectionSet!.selections as FieldNode[];
    const scalarFields = fieldNodes
      .filter(({ name, selectionSet }) => name.value !== 'id' && !selectionSet)
      .map(node => node.name.value);
    const relationFields = fieldNodes
      .filter(({ selectionSet }) => selectionSet)
      .map(node => ({
        name: node.name.value,
        alias: node.alias && node.alias.value,
      }));

    const args: FullArgs = keysToObject(
      argNodes || [],
      ({ value, name }) => valueFromAST(value, argTypes[name.value].type),
      ({ name }) => name.value,
    );

    data[field.type] = data[field.type] || {};
    if (
      !root.type ||
      fieldIs.foreignRelation(field) ||
      (field.isList && args.sort)
    ) {
      firstIds[path] = {};
    }
    Object.keys(queryResults).forEach(rootId => {
      if (root.type && fieldIs.relation(field) && field.isList && !args.sort) {
        if (data[root.type][rootId]![root.field]) {
          data[root.type][rootId]![root.field].unshift(args.start || 0);
        }
      }
      queryResults[rootId].forEach(
        (record, index) =>
          record &&
          (!args.trace ||
            args.trace.start === undefined ||
            index < args.trace.start ||
            args.trace.end === undefined ||
            index >= args.trace.end) &&
          (data[field.type][record.id] = {
            ...(data[field.type][record.id] || {}),
            ...keysToObject(scalarFields, f => record[f]),
            ...keysToObject(
              relationFields,
              ({ name, alias }) =>
                record[alias || name] &&
                mapArray(record[alias || name], rec => rec && rec.id),
              ({ name }) => name,
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
        {
          type: field.type,
          field: node.name.value,
        },
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
                toArray(
                  record[node.alias ? node.alias.value : node.name.value],
                ),
              record => record.id,
            ),
          }),
          {},
        ),
        `${path}_${node.alias ? node.alias.value : node.name.value}`,
      ),
    );
  };

  const rootNodes = operationNode.selectionSet.selections as FieldNode[];
  rootNodes.forEach(node =>
    processLayer(
      { field: node.name.value },
      { type: node.name.value, isList: true },
      node,
      { '': result![node.alias ? node.alias.value : node.name.value] || [] },
      node.alias ? node.alias.value : node.name.value,
    ),
  );
  return { firstIds };
}
