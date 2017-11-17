import keysToObject from 'keys-to-object';

import { standardizeQueries } from './standardize';
import {
  DataChanges,
  Field,
  fieldIs,
  ResolveQuery,
  GetStart,
  Obj,
  QueryLayer,
  Record,
} from './typings';
import {
  createCompare,
  get,
  getFilterFields,
  isEqual,
  noUndef,
  runFilter,
  undefOr,
} from './utils';
import walker from './walker';

const reader = walker<
  (changes: DataChanges) => number,
  {
    schema: Obj<Obj<Field>>;
    data: Obj<Obj<Record>>;
    records: Obj<Obj<Obj>>;
    getStart: GetStart;
  }
>((layer: QueryLayer, relations, { schema, data, records, getStart }) => {
  const { root, field, args, fields, path, key } = layer;
  const rootPath = path.join('_');
  const fieldPath = [...path, key].join('_');

  const structuralFields = Array.from(
    new Set<string>([
      ...(args.filter ? getFilterFields(args.filter) : []),
      ...(args.sort ? args.sort.map(s => s.replace('-', '')) : []),
    ]),
  );

  const filter = (id: string) =>
    runFilter(args.filter, id, data[field.type][id]);
  const compare = createCompare(
    (id: string, key) =>
      key === 'id' ? id : noUndef(data[field.type][id][key]),
    args.sort,
  );

  const rootIds = Object.keys(records[rootPath]);
  const rootRecordIds = {} as Obj<(string | null)[]>;
  records[fieldPath] = {};

  const getValue = (id: string, f: string) => {
    if (f === 'id') return id;
    const v = noUndef(get(data, [field.type, id, f]));
    if (v !== null) return v;
    const s = schema[field.type][f];
    return fieldIs.foreignRelation(s) || s.isList ? [] : null;
  };
  const getRecord = (id: string | null) => {
    if (!id) return null;
    if (records[fieldPath][id]) return records[fieldPath][id];
    return (records[fieldPath][id] = keysToObject(fields, f =>
      getValue(id, f),
    ));
  };

  const allIds = Object.keys(data[field.type] || {});
  const filteredIdsObj = keysToObject(allIds, filter);
  const filteredIds = allIds.filter(id => filteredIdsObj[id]).sort(compare);

  const initRootRecords = (rootId: string) => {
    if (!root.type) {
      rootRecordIds[rootId] = filteredIds;
    } else {
      const value = noUndef(data[root.type][rootId][root.field]);
      if (fieldIs.relation(field)) {
        if (field.isList) {
          if (!args.sort) {
            rootRecordIds[rootId] = ((value || []) as string[]).map(
              id => (filteredIds.includes(id) ? id : null),
            );
          } else {
            rootRecordIds[rootId] = filteredIds.filter(id =>
              ((value || []) as string[]).includes(id),
            );
          }
        } else {
          rootRecordIds[rootId] =
            value && filteredIds.includes(value) ? [value as string] : [];
        }
      } else {
        rootRecordIds[rootId] = filteredIds.filter(id => {
          const v = noUndef(data[field.type][id][field.foreign]);
          return Array.isArray(v) ? v.includes(rootId) : v === rootId;
        });
      }
    }

    if (rootRecordIds[rootId].length === 0) {
      records[rootPath][rootId][root.alias || root.field] =
        fieldIs.foreignRelation(field) || field.isList ? [] : null;
    } else if (fieldIs.relation(field) && field.isList && !args.sort) {
      records[rootPath][rootId][root.alias || root.field] = rootRecordIds[
        rootId
      ].map(getRecord);
    } else if (fieldIs.foreignRelation(field) || field.isList) {
      const start = getStart(layer, rootId, rootRecordIds[rootId]);
      records[rootPath][rootId][root.alias || root.field] = rootRecordIds[
        rootId
      ]
        .slice(start, undefOr(args.end, start - (args.start || 0) + args.end!))
        .map(getRecord);
    } else {
      records[rootPath][rootId][root.alias || root.field] = getRecord(
        rootRecordIds[rootId][0] || null,
      );
    }
  };
  rootIds.forEach(initRootRecords);

  const updaters = relations.map(r => r.walk());

  return (changes: DataChanges) => {
    if (Object.keys(changes).length === 0) return 0;

    const relationsChange = Math.max(
      ...updaters.map(updater => updater(changes)),
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
        if (records[rootPath][id]) {
          if ((changes[root.type][id] || {})[root.field]) return 2;
        }
      }
    }

    let changed = false;
    for (const id of Object.keys(changes[field.type] || {})) {
      if (records[fieldPath][id]) {
        for (const f of Object.keys(changes[field.type][id] || {})) {
          if (fields.includes(f)) {
            const prev = records[fieldPath][id][f];
            records[fieldPath][id][f] = getValue(id, f);
            if (!isEqual(records[fieldPath][id][f], prev)) changed = true;
          }
        }
      }
    }

    return Math.max(relationsChange, changed ? 1 : 0);
  };
});

export default function read(
  queries: ResolveQuery[],
  schema: Obj<Obj<Field>>,
  data: Obj<Obj<Record>>,
  starts: Obj<Obj<string | null>> | GetStart,
) {
  const result: Obj = {};
  const getStart =
    typeof starts === 'function'
      ? starts
      : (
          { args, path, key }: QueryLayer,
          rootId: string,
          recordIds: (string | null)[],
        ) => {
          const fieldPath = [...path, key].join('_');
          return (
            (starts[fieldPath] &&
              recordIds.indexOf(starts[fieldPath][rootId])) ||
            args.start ||
            0
          );
        };
  const updaters = reader(standardizeQueries(queries, schema), schema, {
    schema: schema,
    records: { '': { '': result } },
    data,
    getStart,
  });
  return { result, updaters };
}

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
//           const value = data[root.type!][rootId]![root.field];
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
//                   data[root.type!][id]![field.foreign],
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
//                   data[root.type!][id]![field.foreign],
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
//             const value = ((data[field.type] || {})[id] || {})[f];
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
