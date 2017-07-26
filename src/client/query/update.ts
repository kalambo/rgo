// import { fieldIs, isOrIncludes, locationOf, Obj } from '../../core';

// import { Changes, ClientState, QueryLayer } from '../typings';

// import initRoot from './initRoot';

// export default function update(
//   layer: QueryLayer,
//   rootRecords: Obj<Obj>,
//   state: ClientState,
//   queryResults: Obj<Obj[]>,
//   offsets: Obj<number>,
//   { changes, rootChanges }: Changes,
// ) {
//   const {
//     root,
//     field,
//     args,
//     scalarFields,
//     funcs: { filter, compare },
//     getRecord,
//     state: { rootIds, rootRecordIds, records, filteredIdsObj, filteredIds },
//   } = layer;

//   const added: string[] = [];
//   const maybeRemoved: Obj<true> = {};

//   const filteredAdded: string[] = [];
//   const filteredRemoved: string[] = [];
//   const foreignChanged: string[] = [];
//   for (const id of Object.keys(changes[field.type] || {})) {
//     filteredIdsObj[id] = filteredIdsObj[id] || false;
//     const included = filter(id);
//     if (included !== filteredIdsObj[id]) {
//       if (included) {
//         filteredAdded.push(id);
//         const index = locationOf(id, filteredIds, compare);
//         filteredIds.splice(index, 0, id);

//         if (!root.type) {
//           const i = index - slice.start;
//           if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//             if (slice.end !== undefined && filteredIds[slice.end]) {
//               const endId = filteredIds[slice.end];
//               filteredRemoved.push(endId);
//               rootRecords[''][root.field].pop();
//               delete records[endId];
//             }
//             added.push(id);
//             rootRecords[''][root.field].splice(i, 0, getRecord(id));
//           }
//         }
//       } else {
//         const index = filteredIds.indexOf(id);
//         filteredIds.splice(index, 1);
//         if (records[id]) {
//           filteredRemoved.push(id);
//           delete records[id];
//         }

//         if (!root.type) {
//           const i = index - slice.start;
//           if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//             if (slice.end !== undefined && filteredIds[slice.end]) {
//               const endId = filteredIds[slice.end];
//               added.push(endId);
//               rootRecords[''][root.field].push(getRecord(endId));
//             }
//             rootRecords[''][root.field].splice(i, 1);
//           }
//         }
//       }
//       filteredIdsObj[id] = !filteredIdsObj[id];
//     } else if (
//       included &&
//       fieldIs.foreignRelation(field) &&
//       ((changes[field.type] && {})[id] || {})[field.foreign]
//     ) {
//       foreignChanged.push(id);
//     }
//   }

//   for (let index = rootIds.length - 1; index >= 0; index--) {
//     const rootId = rootIds[index];
//     if (rootChanges.removed.includes(rootId)) {
//       rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
//       rootIds.splice(index, 1);
//       delete rootRecordIds[rootId];
//     } else if (
//       root.type &&
//       ((changes[root.type] && {})[rootId] || {})[root.field]
//     ) {
//       rootRecordIds[rootId].forEach(id => id && (maybeRemoved[id] = true));
//       added.push(
//         ...initRoot(rootId, layer, rootRecords, state, queryResults, offsets),
//       );
//     } else {
//       if (root.type) {
//         const addRecord = (id: string) => {
//           const index = locationOf(id, rootRecordIds[rootId], compare);
//           const i = index - slice.start;
//           if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//             if (slice.end !== undefined && filteredIds[slice.end]) {
//               const endId = filteredIds[slice.end];
//               maybeRemoved[endId] = true;
//               rootRecordIds[rootId].pop();
//               rootRecords[rootId][root.field].pop();
//             }
//             if (!records[id]) added.push(id);
//             rootRecordIds[rootId].splice(index, 0, id);
//             rootRecords[rootId][root.field].splice(i, 0, getRecord(id));
//           }
//         };
//         const removeRecord = (id: string) => {
//           const index = rootRecordIds[rootId].indexOf(id);
//           if (index !== -1) {
//             const i = index - slice.start;
//             if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//               if (slice.end !== undefined && rootRecordIds[rootId][slice.end]) {
//                 const endId = rootRecordIds[rootId][slice.end];
//                 if (endId && !records[endId]) added.push(endId);
//                 rootRecords[rootId][root.field].push(getRecord(endId));
//               }
//               rootRecordIds[rootId].splice(index, 1);
//               rootRecords[rootId][root.field].splice(i, 1);
//             }
//           }
//         };

//         const value = state.combined[root.type!][rootId]![root.field];
//         filteredAdded.forEach(id => {
//           if (fieldIs.relation(field)) {
//             if (field.isList) {
//               if (args.unsorted) {
//                 const index = ((value || []) as string[]).indexOf(id);
//                 if (index !== -1) {
//                   if (!records[id]) added.push(id);
//                   rootRecordIds[rootId][index] = id;
//                   const i = index - slice.start;
//                   if (i >= 0 && (slice.end === undefined || i < slice.end)) {
//                     rootRecords[rootId][root.field][i] = getRecord(id);
//                   }
//                 }
//               } else {
//                 if ((value || []).includes(id)) addRecord(id);
//               }
//             } else {
//               if (value === id) {
//                 if (!records[id]) added.push(id);
//                 rootRecordIds[rootId] = [id];
//                 rootRecords[rootId][root.field] = getRecord(id);
//               }
//             }
//           } else {
//             if (
//               (value || []).includes(id) ||
//               isOrIncludes(
//                 state.combined[root.type!][id]![field.foreign],
//                 rootId,
//               )
//             ) {
//               addRecord(id);
//             }
//           }
//         });
//         filteredRemoved.forEach(id => {
//           if (fieldIs.relation(field)) {
//             if (field.isList) {
//               removeRecord(id);
//             } else {
//               if (rootRecordIds[rootId][0] === id) {
//                 rootRecordIds[rootId] = [];
//                 rootRecords[rootId][root.field] = null;
//               }
//             }
//           } else {
//             removeRecord(id);
//           }
//         });
//         if (fieldIs.foreignRelation(field)) {
//           foreignChanged.forEach(id => {
//             const included =
//               (value || []).includes(id) ||
//               isOrIncludes(
//                 state.combined[root.type!][id]![field.foreign],
//                 rootId,
//               );
//             const prevIndex = rootRecordIds[rootId].indexOf(id);
//             if (included && prevIndex === -1) {
//               addRecord(id);
//             }
//             if (!included && prevIndex !== -1) {
//               maybeRemoved[id] = true;
//               removeRecord(id);
//             }
//           });
//         }
//       }
//     }
//   }
//   for (const rootId of rootChanges.added) {
//     rootIds.push(rootId);
//     added.push(
//       ...initRoot(rootId, layer, rootRecords, state, queryResults, offsets),
//     );
//   }

//   const extraRemoved = Object.keys(maybeRemoved).filter(id =>
//     rootIds.every(rootId => !rootRecordIds[rootId].includes(id)),
//   );
//   extraRemoved.forEach(id => delete records[id]);

//   for (const id of Object.keys(changes[field.type] || {})) {
//     if (records[id] && !added.includes(id)) {
//       for (const f of Object.keys(changes[field.type][id] || {})) {
//         if (scalarFields[f]) {
//           const value = ((state.combined[field.type] || {})[id] || {})[f];
//           if (value === undefined) delete records[id][f];
//           else records[id][f] = value;
//         }
//       }
//     }
//   }

//   return { added, removed: [...filteredRemoved, ...extraRemoved] };
// }
