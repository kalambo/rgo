import { Obj } from 'mishmash';
import { ArgumentNode, FieldNode, parse, print, visit } from 'graphql';

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

const getType = (schema: Obj<Obj<Field>>, path: string) => {
  const [type, ...fields] = path.split('.');
  return fields.reduce(
    (res, f) => (schema[res][f] as ForeignRelationField | RelationField).type,
    type,
  );
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
      enter(node: FieldNode, _key, _parent, path: string) {
        const sels =
          node.selectionSet && (node.selectionSet.selections as FieldNode[]);
        if (sels) {
          const type = getType(schema, path);

          const { filter, sort, skip } = parseArgs(
            buildArgs(node.arguments, variables),
            null,
            schema[type],
          );
          const filterFields = getFields(filter);

          layers[path] = {} as any;
          layers[path].extra = ({ server, combined, diff }: ClientState) => {
            const result = { slice: { skip: 0, show: 0 }, ids: [] as string[] };
            for (const id of Object.keys(diff[type])) {
              if (diff[type][id] === 1 || diff[type][id] === 0) {
                if (
                  filterFields.some(
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
                  filterFields.some(f => server[type][id]![f] === undefined)
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
          node.arguments = [
            ...(node.arguments || []),
            buildVariableArgument('extra', path),
          ];

          const fields = Array.from(
            new Set(['id', ...filterFields, ...sort.map(([f]) => f)]),
          ).filter(
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

          return node;
        }
      },
    },
    leave(node: FieldNode, _key, _parent, path: string) {
      layers[path].query = print({
        ...node,
        arguments: [buildVariableArgument('ids')],
      });
    },
  });

  const readQuery = visit(baseQuery, {
    Field(node: FieldNode) {
      const sels = node.selectionSet && node.selectionSet.selections;
      if (idsOnly && sels) {
        node.selectionSet!.selections = [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
        ];
        return node;
      }
    },
  });

  return { apiQuery: print(apiQuery), layers, readQuery };
}
