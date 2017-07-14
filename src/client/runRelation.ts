import { keysToObject, Obj } from 'mishmash';
import { FieldNode } from 'graphql';

import {
  Args,
  fieldIs,
  ForeignRelationField,
  parseArgs,
  RelationField,
} from '../core';

import {
  buildArgs,
  Changes,
  compareValues,
  createEmitter,
  isOrIncludes,
  locationOf,
  ReadContext,
  runFilter,
} from './utils';

export default function runRelation(
  root: { type?: string; field: string; records: Obj<Obj> },
  field: ForeignRelationField | RelationField,
  args: Args,
  selections: FieldNode[],
  context: ReadContext,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) {
  const { filter: parsedFilter, sort, skip, show } = parseArgs(
    args,
    context.userId,
    context.schema[field.type],
  );
  const scalarFields = keysToObject(
    selections
      .filter(({ selectionSet }) => !selectionSet)
      .map(({ name }) => name.value),
    () => true,
  );

  const filter = (id: string) =>
    runFilter(parsedFilter, context.data[field.type][id]);
  const compare = (id1: string, id2: string) => {
    for (const k of Object.keys(sort)) {
      const comp = compareValues(
        context.data[field.type][id1][k],
        context.data[field.type][id2][k],
      );
      if (comp) return sort[k] === 1 ? comp : -1;
    }
    return 0;
  };
  const slice = { start: skip, end: show === null ? undefined : skip + show };

  const allIds = Object.keys(context.data[field.type]);
  const baseIdsObj = keysToObject(allIds, filter);
  const baseIdsList = allIds.filter(id => baseIdsObj[id]).sort(compare);
  const records: Obj<Obj> = {};
  const rootIds = Object.keys(root.records);
  const recordIds: Obj<(string | null)[]> = {};
  const getRecord = (id: string | null) =>
    id
      ? records[id] ||
        (records[id] = keysToObject(
          Object.keys(scalarFields),
          f => (f === 'id' ? id : context.data[field.type][id][f]),
        ))
      : null;
  const initRoot = (rootId: string) => {
    if (!root.type) {
      recordIds[rootId] = baseIdsList;
    } else {
      const value = context.data[root.type][rootId][root.field];
      if (fieldIs.relation(field)) {
        if (field.isList) {
          if (args.sort) {
            recordIds[rootId] = baseIdsList.filter(id =>
              (value || []).includes(id),
            );
          } else {
            recordIds[rootId] = ((value || []) as string[]).map(
              id => (baseIdsList.includes(id) ? id : null),
            );
          }
        } else {
          recordIds[rootId] =
            value && baseIdsList.includes(value) ? [value as string] : [];
        }
      } else {
        recordIds[rootId] = baseIdsList.filter(
          id =>
            (value || []).includes(id) ||
            isOrIncludes(context.data[field.type!][id][field.foreign], rootId),
        );
      }
    }
    const newIds = recordIds[rootId].filter(id => id && !records[id]);
    root.records[rootId][root.field] =
      !(fieldIs.relation(field) && !field.isList) && recordIds[rootId].length
        ? recordIds[rootId].slice(slice.start, slice.end).map(getRecord)
        : getRecord(recordIds[rootId][0] || null);
    return newIds as string[];
  };
  rootIds.forEach(initRoot);

  const changesEmitter = createEmitter<Changes>();
  const stopRelations = selections
    .filter(({ selectionSet }) => selectionSet)
    .map(node =>
      runRelation(
        { type: field.type, field: node.name.value, records },
        context.schema[field.type][node.name.value] as
          | ForeignRelationField
          | RelationField,
        buildArgs(node.arguments, context.variables),
        node.selectionSet!.selections as FieldNode[],
        context,
        onChanges && changesEmitter.watch,
      ),
    );

  const stop =
    onChanges &&
    onChanges(({ changes, rootChanges }) => {
      const added: string[] = [];
      const maybeRemoved: Obj<true> = {};
      const baseAdded: string[] = [];
      const baseRemoved: string[] = [];
      const foreignChanged: string[] = [];

      for (const id of Object.keys(changes[field.type] || {})) {
        baseIdsObj[id] = baseIdsObj[id] || false;
        const included = filter(id);
        if (included !== baseIdsObj[id]) {
          if (included) {
            baseAdded.push(id);
            const index = locationOf(id, baseIdsList, compare) + 1;
            baseIdsList.splice(index, 0, id);

            if (!root.type) {
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && baseIdsList[slice.end]) {
                  const endId = baseIdsList[slice.end];
                  baseRemoved.push(endId);
                  root.records[''][root.field].pop();
                  delete records[endId];
                }
                root.records[''][root.field].splice(i, 0, getRecord(id));
              }
            }
          } else {
            const index = baseIdsList.indexOf(id);
            baseIdsList.splice(index, 1);
            if (records[id]) {
              baseRemoved.push(id);
              delete records[id];
            }

            if (!root.type) {
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && baseIdsList[slice.end]) {
                  const endId = baseIdsList[slice.end];
                  added.push(endId);
                  root.records[''][root.field].push(getRecord(endId));
                }
                root.records[''][root.field].splice(i, 1);
              }
            }
          }
          baseIdsObj[id] = !baseIdsObj[id];
        } else if (
          included &&
          fieldIs.foreignRelation(field) &&
          ((changes[field.type] && {})[id] || {})[field.foreign]
        ) {
          foreignChanged.push(id);
        }
      }

      for (let index = rootIds.length - 1; index >= 0; index--) {
        const rootId = rootIds[index];
        if (rootChanges.removed.includes(rootId)) {
          recordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
          rootIds.splice(index, 1);
          delete recordIds[rootId];
        } else if (
          root.type &&
          ((changes[root.type] && {})[rootId] || {})[root.field]
        ) {
          recordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
          added.push(...initRoot(rootId));
        } else {
          if (root.type) {
            const addRecord = (id: string) => {
              const index = locationOf(id, recordIds[rootId], compare) + 1;
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && baseIdsList[slice.end]) {
                  const endId = baseIdsList[slice.end];
                  maybeRemoved[endId] = true;
                  recordIds[rootId].pop();
                  root.records[rootId][root.field].pop();
                }
                if (!records[id]) added.push(id);
                recordIds[rootId].splice(index, 0, id);
                root.records[rootId][root.field].splice(i, 0, getRecord(id));
              }
            };
            const removeRecord = (id: string) => {
              const index = recordIds[rootId].indexOf(id);
              if (index !== -1) {
                const i = index - slice.start;
                if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                  if (slice.end !== undefined && recordIds[rootId][slice.end]) {
                    const endId = recordIds[rootId][slice.end];
                    if (endId && !records[endId]) added.push(endId);
                    root.records[rootId][root.field].push(getRecord(endId));
                  }
                  recordIds[rootId].splice(index, 1);
                  root.records[rootId][root.field].splice(i, 1);
                }
              }
            };

            const value = context.data[root.type!][rootId][root.field];
            baseAdded.forEach(id => {
              if (fieldIs.relation(field)) {
                if (field.isList) {
                  if (args.sort) {
                    if ((value || []).includes(id)) addRecord(id);
                  } else {
                    const index = ((value || []) as string[]).indexOf(id);
                    if (index !== -1) {
                      if (!records[id]) added.push(id);
                      recordIds[rootId][index] = id;
                      const i = index - slice.start;
                      if (
                        i >= 0 &&
                        (slice.end === undefined || i < slice.end)
                      ) {
                        root.records[rootId][root.field][i] = getRecord(id);
                      }
                    }
                  }
                } else {
                  if (value === id) {
                    if (!records[id]) added.push(id);
                    recordIds[rootId] = [id];
                    root.records[rootId][root.field] = getRecord(id);
                  }
                }
              } else {
                if (
                  (value || []).includes(id) ||
                  isOrIncludes(
                    context.data[root.type!][id][field.foreign],
                    rootId,
                  )
                ) {
                  addRecord(id);
                }
              }
            });
            baseRemoved.forEach(id => {
              if (fieldIs.relation(field)) {
                if (field.isList) {
                  removeRecord(id);
                } else {
                  if (recordIds[rootId][0] === id) {
                    recordIds[rootId] = [];
                    root.records[rootId][root.field] = null;
                  }
                }
              } else {
                removeRecord(id);
              }
            });
            if (fieldIs.foreignRelation(field)) {
              foreignChanged.forEach(id => {
                const included =
                  (value || []).includes(id) ||
                  isOrIncludes(
                    context.data[root.type!][id][field.foreign],
                    rootId,
                  );
                const prevIndex = recordIds[rootId].indexOf(id);
                if (included && prevIndex === -1) {
                  addRecord(id);
                }
                if (!included && prevIndex !== -1) {
                  maybeRemoved[id] = true;
                  removeRecord(id);
                }
              });
            }
          }
        }
      }
      for (const rootId of rootChanges.added) {
        rootIds.push(rootId);
        added.push(...initRoot(rootId));
      }

      for (const id of Object.keys(changes[field.type] || {})) {
        if (records[id] && !added.includes(id)) {
          for (const f of Object.keys(changes[field.type][id] || {})) {
            if (scalarFields[f]) {
              records[id][f] = context.data[field.type][f];
            }
          }
        }
      }

      const extraRemoved = Object.keys(maybeRemoved).filter(id =>
        rootIds.every(rootId => !recordIds[rootId].includes(id)),
      );
      extraRemoved.forEach(id => delete records[id]);

      changesEmitter.emit({
        changes,
        rootChanges: {
          added,
          removed: [...baseRemoved, ...extraRemoved],
        },
      });
    });

  return () => {
    stopRelations.forEach(s => s());
    stop && stop();
  };
}
