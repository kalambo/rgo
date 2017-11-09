export { default as read } from './read';
export { default as run } from './run';
export {
  Args,
  DataChanges,
  Field,
  fieldIs,
  ForeignRelationField,
  IdRecord,
  Obj,
  Query,
  QueryLayer,
  Record,
  RecordValue,
  RelationField,
  RequestQuery,
  RgoRequest,
  RgoResponse,
  ScalarField,
  Source,
} from './typings';
export {
  createCompare,
  decodeDate,
  encodeDate,
  getFilterFields,
  keysToObject,
  locationOf,
  mapArray,
  mapFilter,
  noUndef,
  promisifyEmitter,
  runFilter,
  standardiseQuery,
  undefOr,
} from './utils';
export { default as walker } from './walker';

export const localPrefix = 'LOCAL__RECORD__';
