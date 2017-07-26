import {
  createCompare,
  createEmitter,
  fieldIs,
  keysToObject,
  locationOf,
  Obj,
  runFilter,
} from '../../core';

import { Changes, ClientState, QueryLayer } from '../typings';

const isOrIncludes = <T>(value: T | T[], elem: T) =>
  Array.isArray(value) ? value.includes(elem) : value === elem;

const nullIfEmpty = (array: any[]) => (array.length === 0 ? null : array);

const runLayer = (
  { root, field, path, args, scalarFields, relations }: QueryLayer,
  rootRecords: Obj<Obj>,
  state: ClientState,
  serverData: Obj<Obj[]>,
  offsets: Obj<number>,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) => {
  const filter = (id: string) =>
    runFilter(args.filter, id, (state.combined[field.type] || {})[id]);
  const compare = createCompare(
    (id: string, key) =>
      key === 'id' ? id : state.combined[field.type][id]![key],
    args.sort,
  );
  const compareRecords = createCompare(
    (record: Obj, key) => record[key],
    args.sort,
  );

  const rootIds = Object.keys(rootRecords);
  const rootRecordIds: Obj<(string | null)[]> = {};
  const records: Obj<Obj> = {};
  const getRecord = (id: string | null) =>
    id
      ? records[id] ||
        (records[id] = keysToObject(
          Object.keys(scalarFields),
          f => (f === 'id' ? id : state.combined[field.type][id]![f]),
        ))
      : null;

  const allIds = Object.keys(state.combined[field.type] || {});
  const filteredIdsObj = keysToObject(allIds, filter);
  const filteredIds = allIds.filter(id => filteredIdsObj[id]).sort(compare);
  const initRoot = (rootId: string) => {
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
            isOrIncludes(
              state.combined[field.type!][id]![field.foreign],
              rootId,
            ),
        );
      }
    }
    const addedIds = rootRecordIds[rootId].filter(id => id && !records[id]);
    if (rootRecordIds[rootId].length === 0) {
      rootRecords[rootId][root.field] = null;
    } else if (fieldIs.relation(field) && field.isList && args.unsorted) {
      rootRecords[rootId][root.field] = nullIfEmpty(
        rootRecordIds[rootId].map(getRecord),
      );
    } else if (fieldIs.foreignRelation(field) || field.isList) {
      const queryFirst = serverData[rootId][offsets[path]];
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
          const queryRecord = serverData[rootId].find(
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
  };
  rootIds.forEach(initRoot);

  const changesEmitter = createEmitter<Changes>();
  const stopRelations = relations.map(layer =>
    runLayer(
      layer,
      records,
      state,
      rootIds.reduce(
        (res, rootId) => ({
          ...res,
          ...keysToObject(
            serverData[rootId],
            record => record[layer.root.field],
            record => record.id,
          ),
        }),
        {},
      ),
      offsets,
      onChanges && changesEmitter.watch,
    ),
  );

  return () => {
    stopRelations.forEach(s => s());
    // stop && stop();
  };
};

export default function run(
  value: Obj,
  queryLayers: QueryLayer[],
  state: ClientState,
  queryData: Obj,
  offsets: Obj<number>,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) {
  return queryLayers.map(layer =>
    runLayer(
      layer,
      { '': value },
      state,
      { '': queryData[layer.root.field] },
      offsets,
      onChanges,
    ),
  );
}

// const stop =
//   onChanges &&
//   onChanges(({ changes, rootChanges }) => {
//     const added: string[] = [];
//     const maybeRemoved: Obj<true> = {};

//     const filteredAdded: string[] = [];
//     const filteredRemoved: string[] = [];
//     const foreignChanged: string[] = [];
//     for (const id of Object.keys(changes[field.type] || {})) {
//       filteredIdsObj[id] = filteredIdsObj[id] || false;
//       const included = filter(id);
//       if (included !== filteredIdsObj[id]) {
//         if (included) {
//           filteredAdded.push(id);
//           const index = locationOf(id, filteredIds, compare);
//           filteredIds.splice(index, 0, id);

//           if (!root.type) {
//             const i = index - slice.start;
//             if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//               if (slice.end !== undefined && filteredIds[slice.end]) {
//                 const endId = filteredIds[slice.end];
//                 filteredRemoved.push(endId);
//                 rootRecords[''][root.field].pop();
//                 delete records[endId];
//               }
//               added.push(id);
//               rootRecords[''][root.field].splice(i, 0, getRecord(id));
//             }
//           }
//         } else {
//           const index = filteredIds.indexOf(id);
//           filteredIds.splice(index, 1);
//           if (records[id]) {
//             filteredRemoved.push(id);
//             delete records[id];
//           }

//           if (!root.type) {
//             const i = index - slice.start;
//             if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//               if (slice.end !== undefined && filteredIds[slice.end]) {
//                 const endId = filteredIds[slice.end];
//                 added.push(endId);
//                 rootRecords[''][root.field].push(getRecord(endId));
//               }
//               rootRecords[''][root.field].splice(i, 1);
//             }
//           }
//         }
//         filteredIdsObj[id] = !filteredIdsObj[id];
//       } else if (
//         included &&
//         fieldIs.foreignRelation(field) &&
//         ((changes[field.type] && {})[id] || {})[field.foreign]
//       ) {
//         foreignChanged.push(id);
//       }
//     }

//     for (let index = rootIds.length - 1; index >= 0; index--) {
//       const rootId = rootIds[index];
//       if (rootChanges.removed.includes(rootId)) {
//         rootRecordIds[rootId].forEach(
//           id => id && (maybeRemoved[id] = true),
//         );
//         rootIds.splice(index, 1);
//         delete rootRecordIds[rootId];
//       } else if (
//         root.type &&
//         ((changes[root.type] && {})[rootId] || {})[root.field]
//       ) {
//         rootRecordIds[rootId].forEach(
//           id => id && (maybeRemoved[id] = true),
//         );
//         added.push(...initRoot(rootId));
//       } else {
//         if (root.type) {
//           const addRecord = (id: string) => {
//             const index = locationOf(id, rootRecordIds[rootId], compare);
//             const i = index - slice.start;
//             if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//               if (slice.end !== undefined && filteredIds[slice.end]) {
//                 const endId = filteredIds[slice.end];
//                 maybeRemoved[endId] = true;
//                 rootRecordIds[rootId].pop();
//                 rootRecords[rootId][root.field].pop();
//               }
//               if (!records[id]) added.push(id);
//               rootRecordIds[rootId].splice(index, 0, id);
//               rootRecords[rootId][root.field].splice(i, 0, getRecord(id));
//             }
//           };
//           const removeRecord = (id: string) => {
//             const index = rootRecordIds[rootId].indexOf(id);
//             if (index !== -1) {
//               const i = index - slice.start;
//               if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//                 if (
//                   slice.end !== undefined &&
//                   rootRecordIds[rootId][slice.end]
//                 ) {
//                   const endId = rootRecordIds[rootId][slice.end];
//                   if (endId && !records[endId]) added.push(endId);
//                   rootRecords[rootId][root.field].push(getRecord(endId));
//                 }
//                 rootRecordIds[rootId].splice(index, 1);
//                 rootRecords[rootId][root.field].splice(i, 1);
//               }
//             }
//           };

//           const value = state.combined[root.type!][rootId]![root.field];
//           filteredAdded.forEach(id => {
//             if (fieldIs.relation(field)) {
//               if (field.isList) {
//                 if (args.unsorted) {
//                   const index = ((value || []) as string[]).indexOf(id);
//                   if (index !== -1) {
//                     if (!records[id]) added.push(id);
//                     rootRecordIds[rootId][index] = id;
//                     const i = index - slice.start;
//                     if (
//                       i >= 0 &&
//                       (slice.end === undefined || i < slice.end)
//                     ) {
//                       rootRecords[rootId][root.field][i] = getRecord(id);
//                     }
//                   }
//                 } else {
//                   if ((value || []).includes(id)) addRecord(id);
//                 }
//               } else {
//                 if (value === id) {
//                   if (!records[id]) added.push(id);
//                   rootRecordIds[rootId] = [id];
//                   rootRecords[rootId][root.field] = getRecord(id);
//                 }
//               }
//             } else {
//               if (
//                 (value || []).includes(id) ||
//                 isOrIncludes(
//                   state.combined[root.type!][id]![field.foreign],
//                   rootId,
//                 )
//               ) {
//                 addRecord(id);
//               }
//             }
//           });
//           filteredRemoved.forEach(id => {
//             if (fieldIs.relation(field)) {
//               if (field.isList) {
//                 removeRecord(id);
//               } else {
//                 if (rootRecordIds[rootId][0] === id) {
//                   rootRecordIds[rootId] = [];
//                   rootRecords[rootId][root.field] = null;
//                 }
//               }
//             } else {
//               removeRecord(id);
//             }
//           });
//           if (fieldIs.foreignRelation(field)) {
//             foreignChanged.forEach(id => {
//               const included =
//                 (value || []).includes(id) ||
//                 isOrIncludes(
//                   state.combined[root.type!][id]![field.foreign],
//                   rootId,
//                 );
//               const prevIndex = rootRecordIds[rootId].indexOf(id);
//               if (included && prevIndex === -1) {
//                 addRecord(id);
//               }
//               if (!included && prevIndex !== -1) {
//                 maybeRemoved[id] = true;
//                 removeRecord(id);
//               }
//             });
//           }
//         }
//       }
//     }
//     for (const rootId of rootChanges.added) {
//       rootIds.push(rootId);
//       added.push(...initRoot(rootId));
//     }

//     const extraRemoved = Object.keys(maybeRemoved).filter(id =>
//       rootIds.every(rootId => !rootRecordIds[rootId].includes(id)),
//     );
//     extraRemoved.forEach(id => delete records[id]);

//     for (const id of Object.keys(changes[field.type] || {})) {
//       if (records[id] && !added.includes(id)) {
//         for (const f of Object.keys(changes[field.type][id] || {})) {
//           if (scalarFields[f]) {
//             const value = ((state.combined[field.type] || {})[id] || {})[f];
//             if (value === undefined) delete records[id][f];
//             else records[id][f] = value;
//           }
//         }
//       }
//     }

//     changesEmitter.emit({
//       changes,
//       rootChanges: {
//         added,
//         removed: [...filteredRemoved, ...extraRemoved],
//       },
//     });
//   });
