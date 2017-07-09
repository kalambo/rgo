import { keysToObject, Obj } from 'mishmash';
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
  userId: string | null;
  variables: Obj;
}

const toArray = x => (Array.isArray(x) ? x : [x]);

const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (typeof a === 'string') return a.localeCompare(b);
  if (a < b) return -1;
  return 1;
};

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

function createResolver(
  type: string | null,
  fieldNodes: FieldNode[],
  context: ReadContext,
  initialData: Obj<Obj<Obj>>,
) {
  const dataFilters = keysToObject(
    fieldNodes.filter(({ selectionSet }) => selectionSet),
    ({ name: { value: fieldName }, selectionSet, arguments: args }) => {
      const field = type
        ? context.schema[type][fieldName] as
            | ForeignRelationField
            | RelationField
        : null;
      const relationType = field ? field.relation.type : fieldName;
      const { filter, sort, skip, show } = parseArgs(
        keysToObject(
          args || [],
          ({ value }) => {
            if (value.kind === 'Variable')
              return context.variables[value.name.value];
            return (value as IntValueNode | StringValueNode).value;
          },
          ({ name }) => name.value,
        ),
        context.userId,
        context.schema[relationType],
      );
      const sortKeys = Object.keys(sort);
      const sortIds = (id1: string, id2: string) => {
        for (const k of sortKeys) {
          const comp = compareValues(
            noUndef(initialData[relationType][id1][k]),
            noUndef(initialData[relationType][id2][k]),
          );
          if (comp) return sort[k] === 1 ? comp : -1;
        }
        return 0;
      };
      const recordIds = Object.keys(initialData[relationType])
        .filter(id => filterRecord(filter, initialData[relationType][id]))
        .sort(sortIds);
      const resolver = createResolver(
        relationType,
        selectionSet!.selections as FieldNode[],
        context,
        initialData,
      );
      if (!type)
        return (_root: Obj, data: Obj<Obj<Obj>>, changes: Obj<Obj<Obj>>) =>
          recordIds
            .map(id => initialData[relationType][id])
            .map(r => resolver(r, data, changes));
      return (root: Obj, data: Obj<Obj<Obj>>, changes: Obj<Obj<Obj>>) => {
        const fieldValue = toArray(noUndef(root[fieldName]));
        const filterId = id => {
          const record = initialData[relationType][id];
          return (
            fieldValue.includes(record.id) ||
            (field!.relation.field &&
              record[field!.relation.field!] === root.id) ||
            false
          );
        };
        return !field || fieldIs.foreignRelation(field) || field.isList
          ? recordIds
              .filter(filterId)
              .slice(skip, show === null ? undefined : skip + show)
              .map(id => initialData[relationType][id])
              .map(r => resolver(r, data, changes))
          : resolver(
              initialData[relationType][recordIds.find(filterId)!],
              data,
              changes,
            );
      };
    },
    ({ name }) => name.value,
  );

  return (
    root: Obj | null = null,
    data: Obj<Obj<Obj>>,
    changes: Obj<Obj<Obj>>,
  ) =>
    root &&
    keysToObject(
      fieldNodes,
      ({ name: { value: fieldName } }) => {
        if (!dataFilters[fieldName]) return noUndef(root![fieldName]);
        return dataFilters[fieldName](root, data, changes);
      },
      ({ name }) => name.value,
    );
}

export default function read(
  queryDoc: DocumentNode,
  context: ReadContext,
  initialData: Obj<Obj<Obj>>,
  listener: (value) => any,
) {
  const resolver = createResolver(
    null,
    (queryDoc.definitions[0] as OperationDefinitionNode).selectionSet
      .selections as FieldNode[],
    context,
    initialData,
  );
  const result = resolver({}, initialData, {});
  if (!listener) return result;
  listener(result);
}
