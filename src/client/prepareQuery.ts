import { Obj } from 'mishmash';
import {
  ArgumentNode,
  ASTNode,
  DocumentNode,
  FieldNode,
  parse,
  print,
  visit,
} from 'graphql';

import {
  Field,
  ForeignRelationField,
  isObject,
  parseArgs,
  RelationField,
  runFilter,
} from '../core';

import { buildArgs } from './index';
import { ClientState } from './typings';

const isFieldNode = (node: ASTNode): node is FieldNode => node.kind === 'Field';

const getPathInfo = (
  schema: Obj<Obj<Field>>,
  queryDoc: DocumentNode,
  astPath: string[],
) => {
  const result = { path: '', type: '' };
  let node = queryDoc;
  for (const k of astPath) {
    node = node[k];
    if (isFieldNode(node)) {
      result.path = result.path
        ? `${result.path}_${node.name.value}`
        : node.name.value;
      result.type = result.type
        ? (schema[result.type][node.name.value] as
            | ForeignRelationField
            | RelationField).type
        : node.name.value;
    }
  }
  return result;
};

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

const buildVariableArgument = (argName: string, varName?: string) =>
  ({
    kind: 'Argument',
    name: { kind: 'Name', value: argName },
    value: {
      kind: 'Variable',
      name: { kind: 'Name', value: varName || argName },
    },
  } as ArgumentNode);

export default function prepareQuery(
  schema: Obj<Obj<Field>>,
  query: string,
  variables: Obj,
  idsOnly?: boolean,
) {
  const baseQuery = parse(query);

  const layers: Obj<{
    extra: (
      state: ClientState,
    ) => { slice: { skip: number; show: number }; ids: string[] };
    query: string;
  }> = {};

  const apiQuery = visit(baseQuery, {
    Field: {
      enter(node: FieldNode, _key, _parent, astPath: string[]) {
        const sels =
          node.selectionSet && (node.selectionSet.selections as FieldNode[]);
        if (sels) {
          const { path, type } = getPathInfo(schema, baseQuery, astPath);

          const { filter, sort, skip } = parseArgs(
            buildArgs(node.arguments, variables),
            null,
            schema[type],
          );
          const filterSortFields = [
            ...getFields(filter),
            ...sort.map(([f]) => f),
          ];

          layers[path] = {} as any;
          layers[path].extra = ({ server, combined, diff }: ClientState) => {
            const result = { slice: { skip: 0, show: 0 }, ids: [] as string[] };
            for (const id of Object.keys(diff[type])) {
              if (diff[type][id] === 1 || diff[type][id] === 0) {
                if (
                  filterSortFields.some(
                    f => combined[type][id]![f] === undefined,
                  ) ||
                  runFilter(filter, id, combined[type][id])
                ) {
                  result.ids.push(id);
                  if (diff[type][id] === 1) result.slice.skip += 1;
                  else if (diff[type][id] === 0) result.slice.show += 1;
                }
              }
              if (diff[type][id] === -1) {
                if (
                  filterSortFields.some(f => server[type][id]![f] === undefined)
                ) {
                  result.ids.push(id);
                  result.slice.show += 1;
                } else if (runFilter(filter, id, server[type][id])) {
                  result.slice.show += 1;
                }
              }
            }
            result.slice.skip = Math.min(result.slice.skip, skip);
            return result;
          };

          const fields = Array.from(
            new Set(['id', ...filterSortFields]),
          ).filter(f => !sels.some(node => node.name.value === f));

          return {
            ...node,
            arguments: [
              ...(node.arguments || []),
              buildVariableArgument('extra', path),
            ],
            selectionSet: {
              ...node.selectionSet,
              selections: [
                ...sels,
                ...fields.map(f => ({
                  kind: 'Field',
                  name: { kind: 'Name', value: f },
                })),
              ],
            },
          };
        }
      },
      leave(node: FieldNode, key: string, _parent, astPath: string[]) {
        const sels =
          node.selectionSet && (node.selectionSet.selections as FieldNode[]);
        if (sels) {
          const { path, type } = getPathInfo(schema, baseQuery, [
            ...astPath,
            key,
          ]);
          layers[path].query = `{
            ${print({
              ...node,
              name: { ...node.name, value: type },
              arguments: [buildVariableArgument('ids')],
            })}
          }`;
        }
      },
    },
  });

  const readQuery = visit(baseQuery, {
    Field(node: FieldNode) {
      if (idsOnly) {
        const sels =
          node.selectionSet && (node.selectionSet.selections as FieldNode[]);
        if (sels && !sels.some(node => node.name.value === 'id')) {
          return {
            ...node,
            selectionSet: {
              ...node.selectionSet,
              selections: [
                ...sels,
                { kind: 'Field', name: { kind: 'Name', value: 'id' } },
              ],
            },
          };
        }
        if (!sels && node.name.value !== 'id') {
          return null;
        }
      }
    },
  });

  return { apiQuery: print(apiQuery), layers, readQuery };
}
