import {
  ClientData,
  DataChanges,
  RelationField,
  ScalarField,
  Schema,
  State,
} from './typings';
import { clone, get, isEqual, isNewId } from './utils';

export default function setState(
  store: 'server' | 'client',
  state: State,
  data: ClientData,
  schema: Schema,
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
                get(state.combined, [type, id, field]),
                get(state.server, [type, id, field]),
              )
            ) {
              setChanged(type, id, field);
            }
          }
        }
        delete state.client[type];
        if (!state.server[type]) delete state.combined[type];
        else state.combined[type] = clone(state.server[type], 1);
        delete state.diff[type];
      }
    } else {
      state[store][type] = state[store][type] || {};
      state.combined[type] = state.combined[type] || {};
      state.diff[type] = state.diff[type] || {};
      for (const id of Object.keys(data[type])) {
        if (
          data[type][id] === undefined ||
          (data[type][id] === null && isNewId(id))
        ) {
          if (store === 'client') {
            for (const field of Object.keys(state.client[type][id] || {})) {
              if (
                !isEqual(
                  get(state.combined, [type, id, field]),
                  get(state.server, [type, id, field]),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.client[type][id];
            if (!get(state.server, [type, id])) delete state.combined[type][id];
            else state.combined[type][id] = clone(state.server[type][id], 0);
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
                  get(state.combined, [type, id, field]),
                  get(state.client, [type, id, field]),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete state.server[type][id];
            if (!get(state.client, [type, id])) {
              delete state.combined[type][id];
            } else {
              state.combined[type][id] = clone(state.client[type][id], 0);
              state.diff[type][id] = 0;
            }
          }
        } else {
          state[store][type][id] = state[store][type][id] || {};
          if (get(state.client, [type, id]) !== null) {
            state.combined[type][id] = state.combined[type][id] || {};
          }
          for (const field of Object.keys(data[type][id]!)) {
            const prev = get(state.combined, [type, id, field]);
            let value = data[type][id]![field];
            const f = schema![type][field] as RelationField | ScalarField;
            if (f.isList && value && (value as any).length === 0) value = null;
            if (store === 'client') {
              state[store][type][id] = state[store][type][id] || {};
              state.combined[type][id] = state.combined[type][id] || {};
              if (data[type][id]![field] === undefined) {
                delete state.client[type][id]![field];
                if (get(state.server, [type, id, field]) !== undefined) {
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
                state.combined[type][id][field] = data[type][id]![field]!;
              }
            } else {
              if (
                get(state.client, [type, id]) !== null &&
                get(state.client, [type, id, field]) === undefined
              ) {
                state.combined[type][id][field] = value!;
              }
              state.server[type][id][field] = value!;
            }
            if (!isEqual(get(state.combined, [type, id, field]), prev)) {
              setChanged(type, id, field);
            }
          }
          if (get(state.client, [type, id]) === undefined) {
            delete state.diff[type][id];
          } else if (get(state.client, [type, id])) {
            state.diff[type][id] = isNewId(id) ? 1 : 0;
          }
        }
      }
    }
  }
}
