import {
  createCompare,
  fieldIs,
  keysToObject,
  locationOf,
  noUndef,
  Obj,
  runFilter,
  undefOr,
} from '../core';

import { ClientState, DataChanges, QueryLayer } from './typings';

const isOrIncludes = <T>(value: T | T[], elem: T) =>
  Array.isArray(value) ? value.includes(elem) : value === elem;

const mapFilterUserId = (filter: any[] | undefined, userId: string | null) => {
  if (!filter) return filter;
  if (Array.isArray(filter[1] || [])) {
    return [filter[0], ...filter.slice(1).map(f => mapFilterUserId(f, userId))];
  }
  if (filter[2] === '$user') return [filter[0], filter[1], userId || ''];
  return filter;
};

export default function readLayer(
  {
    root,
    field,
    args,
    structuralFields,
    scalarFields,
    relations,
    path,
  }: QueryLayer,
  rootRecords: Obj<Obj>,
  state: ClientState,
  firstIds: Obj<Obj<string>>,
  userId: string | null,
) {
  const mappedFilter = mapFilterUserId(args.filter, userId);
  const filter = (id: string) =>
    runFilter(mappedFilter, id, state.combined[field.type][id]);
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
  const rootRecordIds = {} as Obj<(string | null)[]>;
  const sliceStarts = {} as Obj<number>;
  const records = {} as Obj<Obj>;

  const getRecord = (id: string | null) => {
    if (!id) return null;
    if (records[id]) return records[id];
    return (records[id] = keysToObject(
      Object.keys(scalarFields),
      f => (f === 'id' ? id : noUndef(state.combined[field.type][id]![f])),
    ));
  };

  const findRecordIndex = (rootId: string, record: Obj) =>
    locationOf(
      '',
      rootRecordIds[rootId],
      createCompare(
        (id: string, key) =>
          key === 'id'
            ? id || record.id
            : id ? state.combined[field.type][id]![key] : record[key],
        args.sort,
      ),
    );

  const allIds = Object.keys(state.combined[field.type] || {});
  const filteredIdsObj = keysToObject(allIds, filter);
  const filteredIds = allIds.filter(id => filteredIdsObj[id]).sort(compare);

  const initRootRecords = (rootId: string) => {
    if (!root.type) {
      rootRecordIds[rootId] = filteredIds;
    } else {
      const value = state.combined[root.type][rootId]![root.field];
      if (fieldIs.relation(field)) {
        if (field.isList) {
          if (!args.sort) {
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

    if (rootRecordIds[rootId].length === 0) {
      rootRecords[rootId][root.alias || root.field] =
        fieldIs.foreignRelation(field) || field.isList ? [] : null;
    } else if (fieldIs.relation(field) && field.isList && !args.sort) {
      rootRecords[rootId][root.alias || root.field] = rootRecordIds[rootId].map(
        getRecord,
      );
    } else if (fieldIs.foreignRelation(field) || field.isList) {
      const queryFirst = {
        id: firstIds[path][rootId],
        ...state.server[field.type][firstIds[path][rootId]]!,
      };
      const queryStart = findRecordIndex(rootId, queryFirst);
      sliceStarts[rootId] = queryStart;
      for (const id of Object.keys(state.diff[field.type] || {})) {
        if (state.diff[field.type][id] === 1) {
          const localIndex = rootRecordIds[rootId].indexOf(id);
          if (localIndex !== -1 && localIndex < queryStart) {
            sliceStarts[rootId] -= 1;
          }
        }
        if (state.diff[field.type][id] === 0) {
          if (
            state.server[field.type][id] &&
            runFilter(mappedFilter, id, state.server[field.type][id]) &&
            compareRecords(state.server[field.type][id]!, queryFirst) === -1
          ) {
            sliceStarts[rootId] += 1;
          }
          const localIndex = rootRecordIds[rootId].indexOf(id);
          if (localIndex !== -1 && localIndex < queryStart) {
            sliceStarts[rootId] -= 1;
          }
        }
        if (state.diff[field.type][id] === -1) {
          const serverRecord = (state.server[field.type] || {})[id];
          if (
            serverRecord &&
            (!root.type ||
              fieldIs.foreignRelation(field) ||
              state.combined[root.type][rootId]![root.field].includes(id)) &&
            runFilter(mappedFilter, id, serverRecord)
          ) {
            if (compareRecords({ id, ...serverRecord }, queryFirst) === -1) {
              sliceStarts[rootId] += 1;
            }
          }
        }
      }
      rootRecords[rootId][root.alias || root.field] = rootRecordIds[rootId]
        .slice(
          sliceStarts[rootId],
          undefOr(
            args.end,
            sliceStarts[rootId] + args.end! - (args.start || 0),
          ),
        )
        .map(getRecord);
    } else {
      rootRecords[rootId][root.alias || root.field] = getRecord(
        rootRecordIds[rootId][0] || null,
      );
    }
  };
  rootIds.forEach(initRootRecords);

  const relationUpdaters = relations.map(relationLayer =>
    readLayer(relationLayer, records, state, firstIds, userId),
  );

  return (changes: DataChanges, update: boolean) => {
    const relationsChange = Math.max(
      ...relationUpdaters.map(updater => updater(changes, update)),
      0,
    );
    if (relationsChange === 2) return 2;

    for (const id of Object.keys(changes[field.type] || {})) {
      for (const f of structuralFields) {
        if ((changes[field.type][id] || {})[f]) return 2;
      }
      if (
        fieldIs.foreignRelation(field) &&
        (changes[field.type][id] || {})[field.foreign]
      ) {
        return 2;
      }
    }

    if (root.type) {
      for (const id of Object.keys(changes[root.type] || {})) {
        if (rootRecords[id]) {
          if ((changes[root.type][id] || {})[root.field]) return 2;
        }
      }
    }

    let hasUpdated = false;
    if (update) {
      for (const id of Object.keys(changes[field.type] || {})) {
        if (records[id]) {
          for (const f of Object.keys(changes[field.type][id] || {})) {
            if (scalarFields[f]) {
              const prev = records[id][f];
              const value = ((state.combined[field.type] || {})[id] || {})[f];
              if (value === undefined) delete records[id][f];
              else records[id][f] = noUndef(value);
              if (records[id][f] !== prev) hasUpdated = true;
            }
          }
        }
      }
    }

    return Math.max(relationsChange, hasUpdated ? 1 : 0);
  };

  // const sliceInfo = (rootId: string, index: number) => {
  //   const end = args.show !== null ? sliceStarts[rootId] + args.show : null;
  //   return {
  //     before: index <= sliceStarts[rootId],
  //     within: index > sliceStarts[rootId] && (end === null || index < end),
  //     indexInSlice: index - sliceStarts[rootId],
  //     last: end && {
  //       index: end,
  //       id: rootRecordIds[rootId][sliceStarts[rootId] + end] as string,
  //     },
  //   };
  // };

  // const stop =
  //   onChanges &&
  //   onChanges(({ changes, rootChanges }) => {
  //     newRecords = [];
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
  //           console.log(filteredIds);
  //           if (!root.type) {
  //             const info = sliceInfo('', index);
  //             if ((info.before || info.within) && info.last) {
  //               filteredRemoved.push(info.last.id);
  //               rootRecords[''][root.field].pop();
  //               delete records[info.last.id];
  //             }
  //             if (info.before) {
  //               rootRecords[''][root.field].unshift(
  //                 getRecord(filteredIds[sliceStarts['']]),
  //               );
  //             } else if (info.within) {
  //               rootRecords[''][root.field].splice(
  //                 info.indexInSlice,
  //                 0,
  //                 getRecord(id),
  //               );
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
  //             const info = sliceInfo('', index);
  //             if ((info.before || info.within) && info.last) {
  //               rootRecords[''][root.field].push(getRecord(info.last.id));
  //             }
  //             if (info.before) {
  //               rootRecords[''][root.field].shift();
  //             } else if (info.within) {
  //               rootRecords[''][root.field].splice(info.indexInSlice, 1);
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
  //     for (let i = rootIds.length - 1; i >= 0; i--) {
  //       const rootId = rootIds[i];
  //       if (rootChanges.removed.includes(rootId)) {
  //         rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
  //         rootIds.splice(i, 1);
  //         delete rootRecordIds[rootId];
  //         delete sliceStarts[rootId];
  //       } else if (
  //         root.type &&
  //         ((changes[root.type] && {})[rootId] || {})[root.field]
  //       ) {
  //         rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
  //         initRootRecords(rootId);
  //       } else {
  //         if (root.type) {
  //           const addRecord = (id: string) => {
  //             const index = locationOf(id, rootRecordIds[rootId], compare);
  //             const info = sliceInfo(rootId, index);
  //             if (info.before || info.within) {
  //               if (info.last) {
  //                 maybeRemoved[info.last.id] = true;
  //                 rootRecordIds[rootId].splice(info.last.index, 1);
  //                 rootRecords[rootId][root.field].pop();
  //               }
  //               rootRecordIds[rootId].splice(index, 0, id);
  //             }
  //             if (info.before) {
  //               rootRecords[rootId][root.field].unshift(
  //                 getRecord(filteredIds[sliceStarts['']]),
  //               );
  //             } else if (info.within) {
  //               rootRecords[rootId][root.field].splice(
  //                 info.indexInSlice,
  //                 0,
  //                 getRecord(id),
  //               );
  //             }
  //           };
  //           const removeRecord = (id: string) => {
  //             const index = rootRecordIds[rootId].indexOf(id);
  //             if (index !== -1) {
  //               const info = sliceInfo(rootId, index);
  //               if (info.before || info.within) {
  //                 if (info.last) {
  //                   rootRecordIds[rootId].splice(
  //                     info.last.index,
  //                     0,
  //                     info.last.id,
  //                   );
  //                   rootRecords[rootId][root.field].push(
  //                     getRecord(info.last.id),
  //                   );
  //                 }
  //                 rootRecordIds[rootId].splice(index, 1);
  //               }
  //               if (info.before) {
  //                 rootRecords[rootId][root.field].shift();
  //               } else if (info.within) {
  //                 rootRecords[rootId][root.field].splice(info.indexInSlice, 1);
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
  //                     rootRecordIds[rootId][index] = id;
  //                     const i = index - sliceStarts[rootId];
  //                     if (i >= 0 && (args.show === null || i < args.show)) {
  //                       rootRecords[rootId][root.field][i] = getRecord(id);
  //                     }
  //                   }
  //                 } else {
  //                   if ((value || []).includes(id)) addRecord(id);
  //                 }
  //               } else {
  //                 if (value === id) {
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
  //       initRootRecords(rootId);
  //     }
  //     const extraRemoved = Object.keys(maybeRemoved).filter(id =>
  //       rootIds.every(rootId => !rootRecordIds[rootId].includes(id)),
  //     );
  //     extraRemoved.forEach(id => delete records[id]);
  //     for (const id of Object.keys(changes[field.type] || {})) {
  //       if (records[id] && !newRecords.includes(id)) {
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
  //         added: newRecords,
  //         removed: [...filteredRemoved, ...extraRemoved],
  //       },
  //     });
  //   });

  // return () => {
  //   stopRelations.forEach(s => s());
  //   stop && stop();
  // };
}
