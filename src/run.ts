import keysToObject from 'keys-to-object';

import { getRecordValue } from './data';
import { getIdsAndGaps } from './ranges';
import {
  DataState,
  NestedFields,
  Schema,
  Search,
  State,
  Value,
} from './typings';
import { arrayDiff, flatten, nestedFields, unique } from './utils';

interface FieldsState {
  data: DataState;
  fields: NestedFields;
}

// TODO: replace formula field in request with fields it uses instead

const runFields = (
  schema: Schema,
  store: string,
  id: string,
  state: FieldsState | null,
  newState: FieldsState,
) => {
  const fields = unique([
    ...(state ? Object.keys(state.fields) : []),
    ...Object.keys(newState.fields),
  ]);
  const results = fields.map(field => {
    const value = state && getRecordValue(schema, state.data, store, id, field);
    const newValue = getRecordValue(schema, newState.data, store, id, field);
    const nextFields = state && state.fields[field];
    const newNextFields = newState.fields[field];
    if (Array.isArray(newValue)) {
      if (newNextFields === null) {
        const { changes, unchanged } = arrayDiff(
          value as Value[] | null,
          newValue,
        );
        return {
          field,
          changes: state ? changes : unchanged.map(u => u.value.changes),
          searches: [],
        };
      }
      const { changes, unchanged } = arrayDiff(
        value as Value[] | null,
        newValue,
        (id, isNew) =>
          runFields(
            schema,
            schema.links[store][field],
            id as string,
            state && !isNew ? { ...state, fields: nextFields! } : null,
            { ...newState, fields: newNextFields },
          ),
      );
      return {
        field,
        changes: state
          ? [
              ...changes.map(
                c =>
                  c.added ? { ...c, added: c.added.map(a => a.changes) } : c,
              ),
              ...unchanged.map(c => ({ ...c, value: c.value.changes })),
            ]
          : unchanged.map(u => u.value.changes),
        searches: flatten(
          state
            ? [
                ...changes.map(
                  c => (c.added ? flatten(c.added.map(a => a.searches)) : []),
                ),
                ...unchanged.map(c => c.value.searches),
              ]
            : unchanged.map(u => u.value.searches),
        ),
      };
    }
    if (newNextFields === null) {
      return {
        field,
        changes: state ? (value !== newValue ? newValue : undefined) : newValue,
        searches: [],
      };
    }
    return {
      field,
      changes: runFields(
        schema,
        schema.links[store][field],
        newValue as string,
        state && { ...state, fields: nextFields! },
        { ...newState, fields: newNextFields },
      ),
      searches: [],
    };
  });
  return {
    changes: keysToObject(results, r => r.changes, r => r.name),
    searches: flatten(results.map(r => r.searches)),
  };
};

interface SearchesState {
  data: DataState;
  searches: Search[];
}

const runSearches = (
  schema: Schema,
  state: SearchesState | null,
  newState: SearchesState,
  prevStore: string | null,
  prevId: string | null,
) => {
  const names = unique(
    [...((state && state.searches) || []), ...newState.searches].map(
      s => s.name,
    ),
  );
  const results = names
    .map(name => {
      const search =
        (state && state.searches.find(s => s.name === name)) || null;
      const newSearch = newState.searches.find(s => s.name === name) || null;

      const idsAndGaps =
        search && getIdsAndGaps(schema, state!.data, search, prevStore, prevId);
      const ids = idsAndGaps && idsAndGaps.ids;
      const newIdsAndGaps =
        newSearch &&
        getIdsAndGaps(schema, newState.data, newSearch, prevStore, prevId);
      if (newIdsAndGaps === null) {
        return state && ids === null
          ? null
          : { name, changes: undefined, searches: [] };
      }
      const newIds = newIdsAndGaps.ids;

      const { changes, unchanged } = arrayDiff(ids, newIds, (id, isNew) => {
        if (id === undefined) {
          return isNew
            ? {
                changes: undefined,
                searches: [
                  {
                    ...newSearch!,
                    filter: newSearch!.filter
                      ? ['AND', newSearch!.filter, [['id'], '=', id]]
                      : [['id'], '=', id],
                  },
                ],
              }
            : false;
        }
        const fieldsChanges = runFields(
          schema,
          newSearch!.store,
          id,
          state && !isNew
            ? {
                data: state.data,
                fields: search ? nestedFields(search.fields) : {},
              }
            : null,
          { data: newState.data, fields: nestedFields(newSearch!.fields) },
        );
        const searchesChanges = runSearches(
          schema,
          state && !isNew
            ? { data: state.data, searches: search ? search.searches : [] }
            : null,
          { data: newState.data, searches: newSearch!.searches },
          search!.store,
          id,
        );
        return {
          changes: { ...fieldsChanges.changes, ...searchesChanges.changes },
          searches: [...fieldsChanges.searches, ...searchesChanges.searches],
        };
      });
      return {
        name,
        changes: state
          ? [
              ...changes.map(
                c =>
                  c.added ? { ...c, added: c.added.map(a => a.changes) } : c,
              ),
              ...unchanged.map(c => ({ ...c, value: c.value.changes })),
            ]
          : unchanged.map(u => u.value.changes),
        searches: [
          ...newIdsAndGaps.gaps.map(slice => ({
            ...newSearch!,
            slice,
          })),
          ...flatten(
            state
              ? [
                  ...changes.map(
                    c => (c.added ? flatten(c.added.map(a => a.searches)) : []),
                  ),
                  ...unchanged.map(c => c.value.searches),
                ]
              : unchanged.map(u => u.value.searches),
          ),
        ],
      };
    })
    .filter(v => v);
  return {
    changes: keysToObject(results, r => r.changes, r => r.name),
    searches: flatten(results.map(r => r.searches)),
  };
};

export const runDataUpdate = (
  { schema, queries, data }: State,
  newData: DataState,
) =>
  flatten(
    queries.map(({ searches, onChange }) => {
      const { value, searches: requestSearches } = runSearches(
        schema,
        { data, searches },
        { data: newData, searches },
        null,
        null,
      );
      onChange(value);
      return requestSearches;
    }),
  );

export const runSearchUpdate = (
  { schema, queries, data }: State,
  index: number,
  newSearches: Search[],
) => {
  const { searches, onChange } = queries[index];
  const { value, searches: requestSearches } = runSearches(
    schema,
    { data, searches },
    { data, searches: newSearches },
    null,
    null,
  );
  onChange(value);
  return requestSearches;
};
