import keysToObject from 'keys-to-object';

import {
  DataChanges,
  Field,
  Obj,
  Record,
  RecordValue,
  RelationField,
  ScalarField,
  State,
} from './typings';
import { get, isEqual, newIdPrefix, noUndef } from './utils';

const withoutNulls = (rec: Record): Obj<RecordValue> =>
  keysToObject(Object.keys(rec).filter(k => rec[k] !== null), k => rec[k]!);

export default function setState(
  store: 'server' | 'client',
  state: State,
  data: Obj<Obj<Obj<RecordValue | null | undefined> | null | undefined>>,
  schema: Obj<Obj<Field>>,
  changes: DataChanges,
) {
  const setChanged = (type: string, id: string, field: string) => {
    changes[type] = changes[type] || {};
    changes[type][id] = changes[type][id] || {};
    changes[type][id][field] = true;
  };

  for (const type of Object.keys(data)) {
    if (data[type] === undefined) {
      if (store === 'client') {
        for (const id of Object.keys(state.client[type] || {})) {
          for (const field of Object.keys(state.client[type][id] || {})) {
            if (
              !isEqual(
                noUndef(get(state.combined, [type, id, field])),
                noUndef(get(state.server, [type, id, field])),
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
          (data[type][id] === null && id.startsWith(newIdPrefix))
        ) {
          if (store === 'client') {
            for (const field of Object.keys(state.client[type][id] || {})) {
              if (
                !isEqual(
                  noUndef(get(state.combined, [type, id, field])),
                  noUndef(get(state.server, [type, id, field])),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.client[type][id];
            if (get(state.server, [type, id])) {
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
                !isEqual(
                  noUndef(get(state.combined, [type, id, field])),
                  noUndef(get(state.client, [type, id, field])),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.server[type][id];
            if (get(state.client, [type, id])) {
              state.combined[type][id] = withoutNulls(state.client[type][id]!);
              state.diff[type][id] = 0;
            } else {
              delete state.combined[type][id];
            }
          }
        } else {
          state[store][type][id] = state[store][type][id] || {};
          if (get(state.client, [type, id]) !== null) {
            state.combined[type][id] = state.combined[type][id] || {};
          }
          for (const field of Object.keys(data[type][id]!)) {
            const prev = noUndef(get(state.combined, [type, id, field]));
            let value = data[type][id]![field];
            const f = schema![type][field] as RelationField | ScalarField;
            if (f.isList && value && (value as any[]).length === 0) {
              value = null;
            }
            if (store === 'client') {
              state[store][type][id] = state[store][type][id] || {};
              state.combined[type][id] = state.combined[type][id] || {};
              if (data[type][id]![field] === undefined) {
                delete state.client[type][id]![field];
                if (noUndef(get(state.server, [type, id, field])) !== null) {
                  state.combined[type][id][field] = state.server[type][id][
                    field
                  ]!;
                } else {
                  delete state.combined[type][id][field];
                }
                if (Object.keys(state.client[type][id]!).length === 0) {
                  delete state.client[type][id];
                }
                if (Object.keys(state.combined[type][id]).length === 0) {
                  delete state.combined[type][id];
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
              if (
                get(state.client, [type, id]) !== null &&
                get(state.client, [type, id, field]) === undefined
              ) {
                if (value === null) delete state.combined[type][id][field];
                else state.combined[type][id][field] = value!;
              }
              state.server[type][id][field] = value!;
            }
            if (
              !isEqual(noUndef(get(state.combined, [type, id, field])), prev)
            ) {
              setChanged(type, id, field);
            }
          }
          if (get(state.client, [type, id]) === undefined) {
            delete state.diff[type][id];
          } else if (get(state.client, [type, id])) {
            state.diff[type][id] = id.startsWith(newIdPrefix) ? 1 : 0;
          }
        }
      }
    }
  }
}
