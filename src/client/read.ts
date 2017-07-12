import { keysToObject, Obj } from 'mishmash';
import {
  ArgumentNode,
  DocumentNode,
  FieldNode,
  OperationDefinitionNode,
} from 'graphql';

import {
  fieldIs,
  ForeignRelationField,
  noUndef,
  parseArgs,
  RelationField,
} from '../core';

import {
  buildArgs,
  compareValues,
  Data,
  findForeign,
  ReadContext,
  runFilter,
  toArray,
  unique,
} from './utils';

function manageField(
  rootType: string | null,
  field: string,
  type: string,
  isList: boolean,
  foreign: string | null,
  args: ArgumentNode[] = [],
  selections: FieldNode[],
  context: ReadContext,
  roots: Obj<Obj>,
  updater: (cb: (changes: Data) => void) => () => void,
) {
  // const isList = fieldIs.foreignRelation(field) || field.isList;
  // const foreign = findForeign(field, context.schema);
  const { filter: parsedFilter, sort, skip, show } = parseArgs(
    buildArgs(args, context.variables),
    context.userId,
    context.schema[type],
  );
  const scalarFields = keysToObject(
    selections
      .filter(({ selectionSet }) => !selectionSet)
      .map(({ name }) => name.value),
    () => true,
  );

  const filter = (id: string) =>
    runFilter(parsedFilter, context.data[type][id]);
  const compare = (id1: string, id2: string) => {
    for (const k of Object.keys(sort)) {
      const comp = compareValues(
        noUndef(context.data[type][id1][k]),
        noUndef(context.data[type][id2][k]),
      );
      if (comp) return sort[k] === 1 ? comp : -1;
    }
    return 0;
  };
  const slice = (ids: string[]) =>
    ids.slice(skip, show === null ? undefined : skip + show);

  const allIds = Object.keys(context.data[type]);
  const baseIdsObj = keysToObject(allIds, filter);
  const baseIdsList = allIds.filter(id => baseIdsObj[id]).sort(compare);

  const idsForRoot = (rootId: string) => {
    if (!rootType) return slice(baseIdsList);
    const arrayValue = toArray(noUndef(context.data[rootType][rootId][field]));
    const filter = (id: string) =>
      arrayValue.includes(id) ||
      (foreign && context.data[type][id][foreign] === rootId) ||
      false;
    if (isList) return slice(baseIdsList.filter(filter));
    const id = baseIdsList.find(filter);
    return id ? [id] : [];
  };
  const createRecord = (id: string) =>
    keysToObject(
      Object.keys(scalarFields),
      f => (f === 'id' ? id : context.data[type][id][f]),
    );

  const rootIds = rootType ? Object.keys(roots) : [''];
  const recordIds = keysToObject(rootIds, idsForRoot);
  const uniqueIds = unique(
    rootIds.reduce((res, rootId) => [...res, ...recordIds[rootId]], []),
  );
  const records = keysToObject(uniqueIds, createRecord);
  const values = keysToObject(
    rootIds,
    rootId =>
      isList
        ? recordIds[rootId].map(id => records[id])
        : records[recordIds[rootId][0]] || null,
  );
  if (rootType) roots[field] = values[''];
  else rootIds.forEach(rootId => (roots[rootId][field] = values[rootId]));

  const unsubscribes = selections
    .filter(({ selectionSet }) => selectionSet)
    .map(node => {
      const fieldSchema = context.schema[type][node.name.value] as
        | ForeignRelationField
        | RelationField;
      return manageField(
        type,
        node.name.value,
        fieldSchema.type,
        fieldIs.foreignRelation(fieldSchema) || fieldSchema.isList || false,
        findForeign(fieldSchema, context.schema),
        node.arguments,
        node.selectionSet!.selections as FieldNode[],
        context,
        records,
        updater,
      );
    });

  unsubscribes.push(
    updater(changes => {
      // let baseChanged = false;
      // for (const id of Object.keys(changes[field.type] || {})) {
      //   baseIdsObj[id] = baseIdsObj[id] || false;
      //   if (filter(id) !== baseIdsObj[id]) {
      //     baseChanged = true;
      //     if (baseIdsObj[id]) {
      //       const index = baseIdsList.indexOf(id);
      //       baseIdsList.splice(index, 1);
      //     } else {
      //       const index = locationOf(id, baseIdsList, compare) + 1;
      //       baseIdsList.splice(index, 0, id);
      //     }
      //     baseIdsObj[id] = !baseIdsObj[id];
      //   }
      // }

      for (const id of Object.keys(changes[type] || {})) {
        if (records[id]) {
          for (const f of Object.keys(changes[type][id] || {})) {
            if (scalarFields[f]) {
              records[id][f] = context.data[type][f];
            }
          }
        }
      }
    }),
  );

  return () => unsubscribes.forEach(u => u());
}

//   const value = [] as Obj[];
//   const ids = [] as string[];
//   const unsubscribe = updater(
//     (data, _changes, baseIdChanges, compare, getRecord) => {
//       const locationOf = (id: string, start = 0, end = ids.length) => {
//         if (ids.length === 0) return -1;
//         const pivot = (start + end) >> 1;
//         const c = compare(id, ids[pivot]);
//         if (end - start <= 1) return c === -1 ? pivot - 1 : pivot;
//         if (c === 0) return pivot;
//         return c === 1
//           ? locationOf(id, pivot, end)
//           : locationOf(id, start, pivot);
//       };
//       for (const id of Object.keys(baseIdChanges)) {
//         if (baseIdChanges[id]) {
//           if (this.filter(id, data)) {
//             const index = locationOf(id) + 1;
//             value.splice(index, 0, getRecord(id));
//             ids.splice(index, 0, id);
//           }
//         } else {
//           const index = ids.indexOf(id);
//           value.splice(index, 1);
//           ids.splice(index, 1);
//         }
//       }
//     },
//   );
//   return { value, unsubscribe };
// }

export default function read(
  queryDoc: DocumentNode,
  context: ReadContext,
  listener?: (value) => any,
) {
  const fieldNodes = (queryDoc.definitions[0] as OperationDefinitionNode)
    .selectionSet.selections as FieldNode[];
  const value = {};
  fieldNodes.forEach(node =>
    manageField(
      null,
      node.name.value,
      node.name.value,
      true,
      null,
      node.arguments,
      node.selectionSet!.selections as FieldNode[],
      context,
      value,
      1 as any,
    ),
  );
  if (!listener) return value;
  listener(value);
}
