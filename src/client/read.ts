import { keysToObject, Obj } from 'mishmash';
import * as orderBy from 'lodash/fp/orderBy';
import {
  DocumentNode,
  FieldNode,
  IntValueNode,
  OperationDefinitionNode,
  StringValueNode,
} from 'graphql';

import {
  Field,
  fieldIs,
  ForeignRelationField,
  parseArgs,
  RelationField,
  noUndef,
} from '../core';

export interface ReadContext {
  schema: Obj<Obj<Field>>;
  data: Obj<Obj<Obj<any>>>;
  userId: string | null;
  variables: Obj<any>;
}

const getFields = (fieldNodes: FieldNode[], variables: Obj<any>) =>
  fieldNodes.map(
    ({ name: { value: field }, selectionSet, arguments: args }) => ({
      field,
      nested: selectionSet && {
        fieldNodes: selectionSet.selections as FieldNode[],
        args: keysToObject(
          args || [],
          ({ value }) => {
            if (value.kind === 'Variable') return variables[value.name.value];
            return (value as IntValueNode | StringValueNode).value;
          },
          ({ name }) => name.value,
        ),
      },
    }),
  );

const filterRecord = (filter: any, record: any) => {
  const key = Object.keys(filter)[0];

  if (key === '$and')
    return (filter[key] as any[]).every(b => filterRecord(b, record));
  if (key === '$or')
    return (filter[key] as any[]).some(b => filterRecord(b, record));

  const op = Object.keys(filter[key])[0];

  if (op === '$eq') return record[key] === filter[key][op];
  if (op === '$ne') return record[key] !== filter[key][op];
  if (op === '$lt') return record[key] < filter[key][op];
  if (op === '$lte') return record[key] <= filter[key][op];
  if (op === '$gt') return record[key] > filter[key][op];
  if (op === '$gte') return record[key] >= filter[key][op];
  if (op === '$in') return filter[key][op].includes(record[key]);

  return false;
};

const filterData = (
  field: ForeignRelationField | RelationField | string,
  args: Obj<any>,
  values: { id?: string; field?: any },
  context: ReadContext,
) => {
  const type = typeof field !== 'string' ? field.relation.type : field;
  const { filter, sort, skip, show } = parseArgs(
    args,
    context.userId,
    context.schema[type],
  );
  const relationFilters = typeof field !== 'string' && [
    {
      id: { $in: Array.isArray(values.field) ? values.field : [values.field] },
    },
    ...(field.relation.field
      ? [{ [field.relation.field]: { $eq: values.id } }]
      : []),
  ];
  const isList =
    typeof field === 'string' || fieldIs.foreignRelation(field) || field.isList;

  const filteredData = Object.keys(context.data[type])
    .map(id => context.data[type][id])
    .filter(x =>
      filterRecord(
        typeof field !== 'string'
          ? { $and: [filter, { $or: relationFilters }] }
          : filter,
        x,
      ),
    );
  const sortedData = orderBy(
    Object.keys(sort),
    Object.keys(sort).map(k => (sort[k] === 1 ? 'asc' : 'desc')),
    filteredData,
  ) as any[];
  return isList
    ? sortedData.slice(skip, show === null ? undefined : skip + show)
    : sortedData[0] || null;
};

const readLayer = (
  rootType: string,
  root: Obj<any> | Obj<any>[],
  fieldNodes: FieldNode[],
  context: ReadContext,
) => {
  const fields = getFields(fieldNodes, context.variables);
  const mapRecord = (record: Obj<any>) =>
    keysToObject(
      fields,
      ({ field, nested }) => {
        if (!nested) return noUndef(record[field]);
        const fieldSchema = context.schema[rootType][field] as
          | ForeignRelationField
          | RelationField;
        const nestedRoot = filterData(
          fieldSchema,
          nested!.args,
          { id: record.id, field: noUndef(record[field]) },
          context,
        );
        return readLayer(
          fieldSchema.relation.type,
          nestedRoot,
          nested!.fieldNodes,
          context,
        );
      },
      ({ field }) => field,
    );
  return Array.isArray(root) ? root.map(mapRecord) : mapRecord(root);
};

export default function read(queryDoc: DocumentNode, context: ReadContext) {
  const types = getFields(
    (queryDoc.definitions[0] as OperationDefinitionNode).selectionSet
      .selections as FieldNode[],
    context.variables,
  );
  return keysToObject(
    types,
    ({ field, nested }) => {
      const root = filterData(field, nested!.args, {}, context);
      return readLayer(field, root, nested!.fieldNodes, context);
    },
    ({ field }) => field,
  );
}
