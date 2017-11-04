import * as _ from 'lodash';

import {
  decodeDate,
  Field,
  fieldIs,
  FieldValue,
  keysToObject,
  localPrefix,
  mapArray,
  noUndef,
  Obj,
} from '../core';

import { ClientState, DataChanges } from './typings';

const withoutNulls = (obj: Obj<FieldValue | null>): Obj<FieldValue> =>
  keysToObject(Object.keys(obj).filter(k => obj[k] !== null), k => obj[k]!);

export default function setState(
  state: ClientState,
  data: Obj<Obj<Obj<FieldValue | null | undefined> | null | undefined>>,
  schema?: Obj<Obj<Field>>,
) {
  const changes: DataChanges = {};
  const setChanged = (type: string, id: string, field: string) => {
    changes[type] = changes[type] || {};
    changes[type][id] = changes[type][id] || {};
    changes[type][id][field] = true;
  };

  const store = schema ? 'server' : 'client';
  for (const type of Object.keys(data)) {
    if (data[type] === undefined) {
      if (store === 'client') {
        for (const id of Object.keys(state.client[type] || {})) {
          for (const field of Object.keys(state.client[type][id] || {})) {
            if (
              !_.isEqual(
                noUndef(_.get(state.combined, [type, id, field])),
                noUndef(_.get(state.server, [type, id, field])),
              )
            ) {
              setChanged(type, id, field);
            }
          }
        }
        delete state.client[type];
        if (state.server[type]) {
          state.combined[type] = keysToObject(
            Object.keys(state.server[type]),
            id => withoutNulls(state.server[type][id]),
          );
        } else {
          delete state.combined[type];
        }
        delete state.diff[type];
      }
    } else {
      state[store][type] = state[store][type] || {};
      state.combined[type] = state.combined[type] || {};
      state.diff[type] = state.diff[type] || {};
      for (const id of Object.keys(data[type])) {
        if (
          data[type][id] === undefined ||
          (data[type][id] === null && id.startsWith(localPrefix))
        ) {
          if (store === 'client') {
            for (const field of Object.keys(state.client[type][id] || {})) {
              if (
                !_.isEqual(
                  noUndef(_.get(state.combined, [type, id, field])),
                  noUndef(_.get(state.server, [type, id, field])),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.client[type][id];
            if (_.get(state.server, [type, id])) {
              state.combined[type][id] = withoutNulls(state.server[type][id]);
            } else {
              delete state.combined[type][id];
            }
            delete state.diff[type][id];
          }
        } else if (data[type][id] === null) {
          if (store === 'client') {
            for (const field of Object.keys(state.combined[type][id] || {})) {
              setChanged(type, id, field);
            }
            state.client[type][id] = null;
            delete state.combined[type][id];
            state.diff[type][id] = -1;
          } else {
            for (const field of Object.keys(state.combined[type][id] || {})) {
              if (
                !_.isEqual(
                  noUndef(_.get(state.combined, [type, id, field])),
                  noUndef(_.get(state.client, [type, id, field])),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.server[type][id];
            if (_.get(state.client, [type, id])) {
              state.combined[type][id] = withoutNulls(state.client[type][id]!);
              state.diff[type][id] = 0;
            } else {
              delete state.combined[type][id];
            }
          }
        } else {
          state[store][type][id] = state[store][type][id] || {};
          if (_.get(state.client, [type, id]) !== null) {
            state.combined[type][id] = state.combined[type][id] || {};
          }
          for (const field of Object.keys(data[type][id]!)) {
            const prev = noUndef(_.get(state.combined, [type, id, field]));
            if (store === 'client') {
              if (data[type][id]![field] === undefined) {
                delete state.client[type][id]![field];
                if (Object.keys(state.client[type][id]!).length === 0) {
                  delete state.client[type][id];
                }
                if (noUndef(_.get(state.server, [type, id, field])) !== null) {
                  state.combined[type][id][field] = state.server[type][id][
                    field
                  ]!;
                } else {
                  delete state.combined[type][id][field];
                }
              } else {
                state.client[type][id]![field] = data[type][id]![field]!;
                if (data[type][id]![field] === null) {
                  delete state.combined[type][id][field];
                } else {
                  state.combined[type][id][field] = data[type][id]![field]!;
                }
              }
            } else {
              const f = schema![type][field];
              const fieldValue =
                fieldIs.scalar(f) && f.scalar === 'date'
                  ? mapArray(data[type][id]![field], decodeDate)
                  : data[type][id]![field];
              if (
                fieldIs.relation(f) &&
                f.isList &&
                typeof (fieldValue && fieldValue[0]) === 'number'
              ) {
                fieldValue.unshift(...new Array(fieldValue.shift()));
              }
              if (
                _.get(state.client, [type, id]) !== null &&
                _.get(state.client, [type, id, field]) === undefined
              ) {
                if (fieldValue === null) delete state.combined[type][id][field];
                else state.combined[type][id][field] = fieldValue;
              }
              state.server[type][id][field] = fieldValue;
            }
            if (
              !_.isEqual(
                noUndef(_.get(state.combined, [type, id, field])),
                prev,
              )
            ) {
              setChanged(type, id, field);
            }
          }
          if (_.get(state.client, [type, id])) {
            if (Object.keys(_.get(state.client, [type, id])).length === 0) {
              delete state.diff[type][id];
            } else {
              state.diff[type][id] = id.startsWith(localPrefix) ? 1 : 0;
            }
          }
        }
      }
    }
  }

  return changes;
}
