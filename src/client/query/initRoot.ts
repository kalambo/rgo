import {
  createCompare,
  fieldIs,
  isOrIncludes,
  locationOf,
  nullIfEmpty,
  Obj,
  runFilter,
} from '../../core';

import { ClientState, QueryLayer } from '../typings';

export default function initRoot(
  rootId: string,
  {
    root,
    field,
    args,
    funcs: { compareRecords },
    state: { rootRecordIds, records, filteredIds },
    getRecord,
  }: QueryLayer,
  rootRecords: Obj<Obj>,
  state: ClientState,
  queryResults: Obj<Obj[]>,
) {
  if (!root.type) {
    rootRecordIds[rootId] = filteredIds;
  } else {
    const value = state.combined[root.type][rootId]![root.field];
    if (fieldIs.relation(field)) {
      if (field.isList) {
        if (args.unsorted) {
          rootRecordIds[rootId] = ((value || []) as string[]).map(
            id => (filteredIds.includes(id) ? id : null),
          );
        } else {
          rootRecordIds[rootId] = filteredIds.filter(id =>
            (value || []).includes(id),
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
          isOrIncludes(state.combined[field.type!][id]![field.foreign], rootId),
      );
    }
  }
  const addedIds = rootRecordIds[rootId].filter(id => id && !records[id]);
  if (rootRecordIds[rootId].length === 0) {
    rootRecords[rootId][root.field] = null;
  } else if (fieldIs.relation(field) && field.isList && args.unsorted) {
    rootRecords[rootId][root.field] = rootRecordIds[rootId].map(getRecord);
  } else if (fieldIs.foreignRelation(field) || field.isList) {
    const queryFirst = queryResults[rootId][args.offset];
    const queryStart = locationOf(
      '',
      rootRecordIds[rootId],
      createCompare(
        (id: string, key) =>
          key === 'id'
            ? id || queryFirst.id
            : id ? state.combined[field.type][id]![key] : queryFirst[key],
        args.sort,
      ),
    );
    let sliceStart = queryStart;
    for (const id of Object.keys(state.diff[field.type] || {})) {
      if (state.diff[field.type][id] === 1) {
        const localIndex = rootRecordIds[rootId].indexOf(id);
        if (localIndex !== -1 && localIndex < queryStart) sliceStart -= 1;
      }
      if (state.diff[field.type][id] === 0) {
        const queryRecord = queryResults[rootId].find(
          record => record.id === id,
        );
        if (queryRecord && compareRecords(queryRecord, queryFirst) === -1) {
          sliceStart += 1;
        }
        const localIndex = rootRecordIds[rootId].indexOf(id);
        if (localIndex !== -1 && localIndex < queryStart) sliceStart -= 1;
      }
      if (state.diff[field.type][id] === -1) {
        const serverRecord = (state.server[field.type] || {})[id];
        if (
          serverRecord &&
          (!root.type ||
            fieldIs.foreignRelation(field) ||
            state.combined[root.type][rootId]![root.field].includes(id)) &&
          runFilter(args.filter, id, serverRecord)
        ) {
          if (compareRecords({ id, ...serverRecord }, queryFirst) === -1) {
            sliceStart += 1;
          }
        }
      }
    }
    const sliceEnd = args.show === null ? undefined : sliceStart + args.show;
    rootRecords[rootId][root.field] = nullIfEmpty(
      rootRecordIds[rootId].slice(sliceStart, sliceEnd).map(getRecord),
    );
  } else {
    rootRecords[rootId][root.field] = getRecord(
      rootRecordIds[rootId][0] || null,
    );
  }
  return addedIds as string[];
}
