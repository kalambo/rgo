// TODO: always calculate formula on client pushing an update, to put new value in db

// import { getDataRecordValue, idInFilterBox, mergeData, sortIds } from './data';
// import { Data, FirstIds, NestedFields, Requests, Schema } from './typings';
// import { hash } from './utils';

// const set = (obj: any, path: string[], value: any) => {
//   path.reduce((res, k, i) => {
//     res[k] = i === path.length - 1 ? value : res[k] || {};
//     return res;
//   }, obj);
// };

// const getFieldsData = (
//   schema: Schema,
//   data: Data,
//   store: string,
//   id: string,
//   fields: NestedFields,
// ) => {
//   const result: Data = {};
//   for (const field of Object.keys(fields)) {
//     if (fields[field] === null) {
//       set(
//         result,
//         [store, id, field],
//         getDataRecordValue(data, store, id, field),
//       );
//     } else {
//       mergeData(
//         result,
//         getFieldsData(schema, data, schema[store][field], id, fields[
//           field
//         ] as NestedFields),
//       );
//     }
//   }
//   return result;
// };

// export const runRequests = (
//   schema: Schema,
//   data: Data,
//   requests: Requests,
//   prevStore?: string,
//   prevId?: string,
// ): { data: Data; firstIds: FirstIds } => {
//   let result: Data = {};
//   const firstIds = {};
//   for (const [store, storeRequests] of requests) {
//     for (const [filter, filterRequests] of storeRequests) {
//       const ids = Object.keys(data[store]).filter(id =>
//         idInFilterBox(schema, data, store, id, filter, prevStore, prevId),
//       );
//       for (const [sort, sortRequests] of filterRequests) {
//         const sortedIds = sortIds(schema, data, store, ids, sort);
//         for (const [slice, sliceRequests] of sortRequests) {
//           const slicedIds = sortedIds.slice(slice.start, slice.end);
//           set(
//             firstIds,
//             [store, filter, sort, slice, ''].map(hash),
//             slicedIds[0],
//           );
//           for (const id of slicedIds) {
//             for (const { fields, requests } of sliceRequests) {
//               result = mergeData(
//                 result,
//                 getFieldsData(schema, data, store, id, fields),
//               );
//               if (requests.length !== 0) {
//                 const next = runRequests(schema, data, requests, store, id);
//                 result = mergeData(result, next.data);
//                 set(
//                   firstIds,
//                   [store, filter, sort, slice, id].map(hash),
//                   next.firstIds,
//                 );
//               }
//             }
//           }
//         }
//       }
//     }
//   }
//   return { data: result, firstIds };
// };
