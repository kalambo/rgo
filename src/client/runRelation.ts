import { keysToObject, Obj } from 'mishmash';
import { ArgumentNode, FieldNode } from 'graphql';

import {
  fieldIs,
  ForeignRelationField,
  noUndef,
  parseArgs,
  RelationField,
} from '../core';

import {
  buildArgs,
  Changes,
  compareValues,
  createEmitter,
  findForeign,
  locationOf,
  ReadContext,
  runFilter,
  toArray,
  unique,
} from './utils';

export default function runRelation(
  root: { type: string; records: Obj<Obj> } | { record: Obj },
  field: string,
  type: string,
  isList: boolean,
  foreign: string | null,
  args: ArgumentNode[] = [],
  selections: FieldNode[],
  context: ReadContext,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) {
  const rootType = (root as { type: string }).type || null;
  const rootRecords = (root as { records: Obj<Obj> }).records || {
    '': (root as { record: Obj }).record,
  };
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
  const slice = { start: skip, end: show === null ? undefined : skip + show };

  const allIds = Object.keys(context.data[type]);
  const baseIdsObj = keysToObject(allIds, filter);
  const baseIdsList = allIds.filter(id => baseIdsObj[id]).sort(compare);
  const rootIds = Object.keys(rootRecords);
  const recordIdsMap: Obj<string[]> = {};
  const records: Obj<Obj> = {};

  const rootFilter = (rootId: string) => {
    if (!rootType) return () => true;
    const arrayValue = toArray(noUndef(context.data[rootType][rootId][field]));
    return (id: string) =>
      arrayValue.includes(id) ||
      (foreign && context.data[type][id][foreign] === rootId) ||
      false;
  };
  const getRecord = (id?: string) =>
    id
      ? records[id] ||
        (records[id] = keysToObject(
          Object.keys(scalarFields),
          f => (f === 'id' ? id : context.data[type][id][f]),
        ))
      : null;
  const initRoot = (rootId: string) => {
    if (!rootType) {
      recordIdsMap[rootId] = baseIdsList;
    } else if (isList) {
      recordIdsMap[rootId] = baseIdsList.filter(rootFilter(rootId));
    } else {
      const id = baseIdsList.find(rootFilter(rootId));
      recordIdsMap[rootId] = id ? [id] : [];
    }
    rootRecords[rootId][field] = isList
      ? recordIdsMap[rootId].slice(slice.start, slice.end).map(getRecord)
      : getRecord(recordIdsMap[rootId][0]);
  };
  rootIds.forEach(initRoot);

  const changesEmitter = createEmitter<Changes>();
  const stopRelations = selections
    .filter(({ selectionSet }) => selectionSet)
    .map(node => {
      const fieldSchema = context.schema[type][node.name.value] as
        | ForeignRelationField
        | RelationField;
      return runRelation(
        { type, records },
        node.name.value,
        fieldSchema.type,
        fieldIs.foreignRelation(fieldSchema) || fieldSchema.isList || false,
        findForeign(fieldSchema, context.schema),
        node.arguments,
        node.selectionSet!.selections as FieldNode[],
        context,
        onChanges && changesEmitter.watch,
      );
    });

  const stop =
    onChanges &&
    onChanges(({ changes, rootChanges }) => {
      const baseIdChanges: { added: string[]; removed: string[] } = {
        added: [],
        removed: [],
      };
      for (const id of Object.keys(changes[type] || {})) {
        baseIdsObj[id] = baseIdsObj[id] || false;
        if (filter(id) !== baseIdsObj[id]) {
          if (baseIdsObj[id]) {
            baseIdChanges.removed.push(id);
            const index = baseIdsList.indexOf(id);
            baseIdsList.splice(index, 1);
          } else {
            baseIdChanges.added.push(id);
            const index = locationOf(id, baseIdsList, compare) + 1;
            baseIdsList.splice(index, 0, id);
          }
          baseIdsObj[id] = !baseIdsObj[id];
        }
      }

      const prevAllRecordIds = Object.keys(records);
      for (const rootId of rootIds) {
        if (rootChanges.removed.includes(rootId)) {
          rootIds.splice(rootIds.indexOf(rootId), 1);
          delete recordIdsMap[rootId];
        } else {
          if (
            rootType &&
            ((changes[rootType] && {})[rootId] || {})[field] !== undefined
          ) {
            initRoot(rootId);
          } else {
            for (const id of baseIdChanges.removed) {
              if (isList) {
                const index = recordIdsMap[rootId].indexOf(id);
                if (index !== -1) {
                  recordIdsMap[rootId].splice(index, 1);
                  const i = index - slice.start;
                  if (i >= 0) {
                    if (slice.end === undefined) {
                      rootRecords[rootId][field].splice(i, 1);
                    } else if (i < slice.end) {
                      if (recordIdsMap[rootId][slice.end]) {
                        rootRecords[rootId][field].push(
                          getRecord(recordIdsMap[rootId][slice.end]),
                        );
                      }
                      rootRecords[rootId][field].splice(i, 1);
                    }
                  }
                }
              } else {
                if (recordIdsMap[rootId][0] === id) {
                  recordIdsMap[rootId] = [];
                  rootRecords[rootId][field] = null;
                }
              }
            }
            for (const id of baseIdChanges.added.filter(rootFilter(rootId))) {
              if (isList) {
                const index = locationOf(id, recordIdsMap[rootId], compare) + 1;
                recordIdsMap[rootId].splice(index, 0, id);
                const i = index - slice.start;
                if (i >= 0) {
                  if (slice.end === undefined) {
                    rootRecords[rootId][field].splice(i, 0, getRecord(id));
                  } else if (i < slice.end) {
                    if (rootRecords[rootId][field][slice.end]) {
                      rootRecords[rootId][field].pop();
                    }
                    rootRecords[rootId][field].splice(i, 0, getRecord(id));
                  }
                }
              } else {
                recordIdsMap[rootId] = [id];
                rootRecords[rootId][field] = getRecord(id);
              }
            }
          }
        }
      }
      for (const rootId of rootChanges.added) {
        rootIds.push(rootId);
        initRoot(rootId);
      }

      const allRecordIds = unique(
        rootIds.reduce((res, rootId) => [...res, ...recordIdsMap[rootId]], []),
      );
      const recordChanges = {
        added: allRecordIds.filter(id => !prevAllRecordIds.includes(id)),
        removed: prevAllRecordIds.filter(id => !allRecordIds.includes(id)),
      };
      recordChanges.removed.forEach(id => delete records[id]);

      for (const id of Object.keys(changes[type] || {})) {
        if (records[id] && !recordChanges.added.includes(id)) {
          for (const f of Object.keys(changes[type][id] || {})) {
            if (scalarFields[f]) {
              records[id][f] = context.data[type][f];
            }
          }
        }
      }

      changesEmitter.emit({ changes, rootChanges: recordChanges });
    });

  return () => {
    stopRelations.forEach(s => s());
    stop && stop();
  };
}
