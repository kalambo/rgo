import { createEmitter, keysToObject, locationOf, Obj } from 'mishmash';
import { FieldNode } from 'graphql';

import {
  Args,
  compareValues,
  fieldIs,
  ForeignRelationField,
  parseArgs,
  RelationField,
  runFilter,
} from '../core';

import { buildArgs } from './index';
import { Changes, ReadContext } from './typings';

const isOrIncludes = <T>(value: T | T[], elem: T) =>
  Array.isArray(value) ? value.includes(elem) : value === elem;

export default function runRelation(
  root: { type?: string; field: string; records: Obj<Obj> },
  field: ForeignRelationField | RelationField,
  args: Args,
  selections: FieldNode[],
  path: string,
  context: ReadContext,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) {
  const { filter: parsedFilter, sort, skip, show } = parseArgs(
    args,
    context.userId,
    context.schema[field.type],
  );
  const filter = (id: string) =>
    runFilter(parsedFilter, id, (context.data[field.type] || {})[id]);
  const compare = (id1: string, id2: string): 0 | 1 | -1 => {
    for (const [key, order] of sort) {
      const comp =
        key === 'id'
          ? compareValues(id1, id2)
          : compareValues(
              context.data[field.type][id1]![key],
              context.data[field.type][id2]![key],
            );
      if (comp) return order === 'asc' ? comp : -comp as 1 | -1;
    }
    return 0;
  };
  const slice = { start: skip, end: show === null ? undefined : skip + show };

  const scalarFields = keysToObject(
    selections
      .filter(({ selectionSet }) => !selectionSet)
      .map(({ name }) => name.value),
    () => true,
  );

  const rootIds = Object.keys(root.records);
  const rootRecordIds: Obj<(string | null)[]> = {};
  const records: Obj<Obj> = {};
  const getRecord = (id: string | null) =>
    id
      ? records[id] ||
        (records[id] = keysToObject(
          Object.keys(scalarFields),
          f => (f === 'id' ? id : context.data[field.type][id]![f]),
        ))
      : null;

  const allIds = Object.keys(context.data[field.type] || {});
  const filteredIdsObj = keysToObject(allIds, filter);
  const filteredIds = allIds.filter(id => filteredIdsObj[id]).sort(compare);
  const initRoot = (rootId: string) => {
    if (!root.type) {
      rootRecordIds[rootId] = filteredIds;
    } else {
      const value = context.data[root.type][rootId]![root.field];
      if (fieldIs.relation(field)) {
        if (field.isList) {
          if (args.sort) {
            rootRecordIds[rootId] = filteredIds.filter(id =>
              (value || []).includes(id),
            );
          } else {
            rootRecordIds[rootId] = ((value || []) as string[]).map(
              id => (filteredIds.includes(id) ? id : null),
            );
          }
        } else {
          rootRecordIds[rootId] =
            value && filteredIds.includes(value) ? [value as string] : [];
        }
      } else {
        rootRecordIds[rootId] = filteredIds.filter(
          id =>
            (value || []).includes(id) ||
            isOrIncludes(context.data[field.type!][id]![field.foreign], rootId),
        );
      }
    }
    const addedIds = rootRecordIds[rootId].filter(id => id && !records[id]);
    if (rootRecordIds[rootId].length === 0) {
      root.records[rootId][root.field] = null;
    } else if (fieldIs.foreignRelation(field) || field.isList) {
      const sliceStart = rootRecordIds[rootId].indexOf(
        context.firstIds[path][rootId],
      );
      const sliceEnd = show === null ? undefined : sliceStart + show;
      root.records[rootId][root.field] = rootRecordIds[rootId]
        .slice(sliceStart, sliceEnd)
        .map(getRecord);
    } else {
      root.records[rootId][root.field] = getRecord(
        rootRecordIds[rootId][0] || null,
      );
    }
    return addedIds as string[];
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
        `${path}.${node.name.value}`,
        context,
        onChanges && changesEmitter.watch,
      ),
    );

  const stop =
    onChanges &&
    onChanges(({ changes, rootChanges }) => {
      const added: string[] = [];
      const maybeRemoved: Obj<true> = {};

      const filteredAdded: string[] = [];
      const filteredRemoved: string[] = [];
      const foreignChanged: string[] = [];
      for (const id of Object.keys(changes[field.type] || {})) {
        filteredIdsObj[id] = filteredIdsObj[id] || false;
        const included = filter(id);
        if (included !== filteredIdsObj[id]) {
          if (included) {
            filteredAdded.push(id);
            const index = locationOf(id, filteredIds, compare);
            filteredIds.splice(index, 0, id);

            if (!root.type) {
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && filteredIds[slice.end]) {
                  const endId = filteredIds[slice.end];
                  filteredRemoved.push(endId);
                  root.records[''][root.field].pop();
                  delete records[endId];
                }
                added.push(id);
                root.records[''][root.field].splice(i, 0, getRecord(id));
              }
            }
          } else {
            const index = filteredIds.indexOf(id);
            filteredIds.splice(index, 1);
            if (records[id]) {
              filteredRemoved.push(id);
              delete records[id];
            }

            if (!root.type) {
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && filteredIds[slice.end]) {
                  const endId = filteredIds[slice.end];
                  added.push(endId);
                  root.records[''][root.field].push(getRecord(endId));
                }
                root.records[''][root.field].splice(i, 1);
              }
            }
          }
          filteredIdsObj[id] = !filteredIdsObj[id];
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
          rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
          rootIds.splice(index, 1);
          delete rootRecordIds[rootId];
        } else if (
          root.type &&
          ((changes[root.type] && {})[rootId] || {})[root.field]
        ) {
          rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
          added.push(...initRoot(rootId));
        } else {
          if (root.type) {
            const addRecord = (id: string) => {
              const index = locationOf(id, rootRecordIds[rootId], compare);
              const i = index - slice.start;
              if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                if (slice.end !== undefined && filteredIds[slice.end]) {
                  const endId = filteredIds[slice.end];
                  maybeRemoved[endId] = true;
                  rootRecordIds[rootId].pop();
                  root.records[rootId][root.field].pop();
                }
                if (!records[id]) added.push(id);
                rootRecordIds[rootId].splice(index, 0, id);
                root.records[rootId][root.field].splice(i, 0, getRecord(id));
              }
            };
            const removeRecord = (id: string) => {
              const index = rootRecordIds[rootId].indexOf(id);
              if (index !== -1) {
                const i = index - slice.start;
                if (i >= 0 && (slice.end === undefined || i < slice.end)) {
                  if (
                    slice.end !== undefined &&
                    rootRecordIds[rootId][slice.end]
                  ) {
                    const endId = rootRecordIds[rootId][slice.end];
                    if (endId && !records[endId]) added.push(endId);
                    root.records[rootId][root.field].push(getRecord(endId));
                  }
                  rootRecordIds[rootId].splice(index, 1);
                  root.records[rootId][root.field].splice(i, 1);
                }
              }
            };

            const value = context.data[root.type!][rootId]![root.field];
            filteredAdded.forEach(id => {
              if (fieldIs.relation(field)) {
                if (field.isList) {
                  if (args.sort) {
                    if ((value || []).includes(id)) addRecord(id);
                  } else {
                    const index = ((value || []) as string[]).indexOf(id);
                    if (index !== -1) {
                      if (!records[id]) added.push(id);
                      rootRecordIds[rootId][index] = id;
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
                    rootRecordIds[rootId] = [id];
                    root.records[rootId][root.field] = getRecord(id);
                  }
                }
              } else {
                if (
                  (value || []).includes(id) ||
                  isOrIncludes(
                    context.data[root.type!][id]![field.foreign],
                    rootId,
                  )
                ) {
                  addRecord(id);
                }
              }
            });
            filteredRemoved.forEach(id => {
              if (fieldIs.relation(field)) {
                if (field.isList) {
                  removeRecord(id);
                } else {
                  if (rootRecordIds[rootId][0] === id) {
                    rootRecordIds[rootId] = [];
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
                    context.data[root.type!][id]![field.foreign],
                    rootId,
                  );
                const prevIndex = rootRecordIds[rootId].indexOf(id);
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

      const extraRemoved = Object.keys(maybeRemoved).filter(id =>
        rootIds.every(rootId => !rootRecordIds[rootId].includes(id)),
      );
      extraRemoved.forEach(id => delete records[id]);

      for (const id of Object.keys(changes[field.type] || {})) {
        if (records[id] && !added.includes(id)) {
          for (const f of Object.keys(changes[field.type][id] || {})) {
            if (scalarFields[f]) {
              const value = ((context.data[field.type] || {})[id] || {})[f];
              if (value === undefined) delete records[id][f];
              else records[id][f] = value;
            }
          }
        }
      }

      changesEmitter.emit({
        changes,
        rootChanges: {
          added,
          removed: [...filteredRemoved, ...extraRemoved],
        },
      });
    });

  return () => {
    stopRelations.forEach(s => s());
    stop && stop();
  };
}
