import { Obj } from 'mishmash';
import {
  DocumentNode,
  FieldNode,
  OperationDefinitionNode,
  parse,
  visit,
} from 'graphql';

import {
  Data,
  Field,
  ForeignRelationField,
  isObject,
  parseArgs,
  RelationField,
  runFilter,
} from '../core';

import { buildArgs } from './index';
import { DataDiff } from './typings';

const getFields = (obj: any): string[] => {
  if (Array.isArray(obj)) {
    return obj.reduce((res, o) => [...res, ...getFields(o)], [] as string[]);
  }
  if (isObject(obj)) {
    return Object.keys(obj).reduce(
      (res, k) => [...res, ...(k[0] === '$' ? getFields(obj[k]) : [k])],
      [] as string[],
    );
  }
  return [];
};

export default function prepareQuery(
  schema: Obj<Obj<Field>>,
  data: Data,
  diff: DataDiff,
  query: string,
  variables: Obj,
  idsOnly?: boolean,
) {
  const prepareApiField = (type: string, node: FieldNode) => {
    const sels =
      node.selectionSet && (node.selectionSet.selections as FieldNode[]);
    if (sels) {
      sels.forEach(f =>
        prepareApiField(
          (schema[type][node.name.value] as
            | ForeignRelationField
            | RelationField).type,
          f as FieldNode,
        ),
      );

      const newFields: string[] = ['id'];

      const { filter, sort, skip, show } = parseArgs(
        buildArgs(node.arguments, variables),
        null,
        schema[type],
      );
      const sliceChanges = { skip: 0, show: 0 };
      for (const id of Object.keys(diff[type])) {
        if (runFilter(filter, id, data[type][id])) {
          if (diff[type][id] === 1 || diff[type][id] === 0) {
            sliceChanges.skip += 1;
          }
          if (diff[type][id] === -1 || diff[type][id] === 0) {
            sliceChanges.show += 1;
          }
        }
      }
      (node.arguments || []).forEach(arg => {
        if (arg.name.value === 'filter') {
          newFields.push(...getFields(filter));
        }
        if (arg.name.value === 'sort') {
          newFields.push(...sort.map(([f]) => f));
        }
        if (arg.name.value === 'skip') {
          (arg.value as any).value = `${skip - sliceChanges.skip}`;
        }
        if (arg.name.value === 'show') {
          (arg.value as any).value =
            show === null ? undefined : `${show + sliceChanges.show}`;
        }
      });

      const fields = Array.from(new Set(newFields)).filter(
        f => !sels.some(s => s.kind === 'Field' && s.name.value === f),
      );

      if (fields.length > 0) {
        node.selectionSet!.selections = [
          ...sels,
          ...fields.map(f => ({
            kind: 'Field',
            name: { kind: 'Name', value: f },
          })),
        ] as FieldNode[];
      }
    }
  };
  const apiQuery = parse(query) as DocumentNode;
  ((apiQuery.definitions[0] as OperationDefinitionNode).selectionSet
    .selections as FieldNode[]).forEach(f => prepareApiField(f.name.value, f));

  const readQuery = visit(parse(query) as DocumentNode, {
    Argument() {
      return false;
    },
    Field(node: FieldNode) {
      const sels = node.selectionSet && node.selectionSet.selections;
      if (sels) {
        if (!sels.some(s => s.kind === 'Field' && s.name.value === 'id')) {
          return {
            ...node,
            selectionSet: {
              ...node.selectionSet,
              selections: [
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
                ...sels,
              ],
            },
          } as FieldNode;
        }
      } else {
        if (idsOnly && node.name.value !== 'id') {
          return null;
        }
      }
    },
  });

  return { apiQuery, readQuery };
}
