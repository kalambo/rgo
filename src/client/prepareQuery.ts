import { parse, visit, FieldNode } from 'graphql';

import { isObject, parseFilter, parseSort } from '../core';

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

export default function prepareQuery(query: string, idsOnly?: boolean) {
  const apiQuery = visit(parse(query), {
    Argument() {
      return false;
    },
    Field(node: FieldNode) {
      const sels = node.selectionSet && node.selectionSet.selections;
      if (sels) {
        const newFields: string[] = ['id'];

        const args = node.arguments;
        if (args) {
          const filter = args.find(a => a.name.value === 'filter');
          if (filter && (filter.value as any).value) {
            const parsedFilter = parseFilter((filter.value as any).value, '');
            newFields.push(...getFields(parsedFilter));
          }

          const sort = args.find(a => a.name.value === 'sort');
          if (sort) {
            const parsedSort = parseSort((sort.value as any).value);
            newFields.push(...Object.keys(parsedSort));
          }
        }

        const fields = Array.from(new Set(newFields)).filter(
          f => !sels.some(s => s.kind === 'Field' && s.name.value === f),
        );

        if (fields.length > 0) {
          return {
            ...node,
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
          } as FieldNode;
        }
      }
    },
  });

  const readQuery = visit(parse(query), {
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
