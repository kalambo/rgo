import { diffArrays } from 'diff';
import keysToObject from 'keys-to-object';

import { getRecordValue, getSearchIds } from './data';
import {
  DataState,
  FieldPath,
  NestedFields,
  Schema,
  Search,
  State,
  Value,
} from './typings';
import { getNestedFields, hash } from './utils';

type Change<T> = { index: number; added?: T[]; removed?: number; value?: any };

const getArrayChanges = <T = any>(
  items: T[] | null,
  newItems: T[],
  map?: (v: T, isNew: boolean) => any,
): { changes: Change<T>[]; unchanged: Change<T>[] } => {
  if (!items) {
    return {
      changes: [],
      unchanged: newItems.map((item, i) => ({
        index: i,
        value: map ? map(item, false) : item,
      })),
    };
  }
  const d = diffArrays(items, newItems);
  const changes: Change<T>[] = [];
  const unchanged: Change<T>[] = [];
  let index = 0;
  let i = 0;
  while (i < d.length) {
    if (d[i].added || d[i].removed) {
      const d2 = d[i + 1] || {};
      const added = d[i].added ? d[i].value : d2.added ? d2.value : null;
      const removed = d[i].removed ? d[i].count : d2.removed ? d2.count : null;
      changes.push({
        index,
        ...(added ? { added: map ? added.map(v => map(v, true)) : added } : {}),
        ...(removed ? { removed } : {}),
      });
      if (added) index += added.length;
      if (removed) index += removed;
      if (d2.added || d2.removed) i++;
    } else {
      for (let j = 0; j < d[i].count!; j++) {
        const v = newItems[index + j];
        unchanged.push({
          index: index + j,
          value: map ? map(v, false) : v,
        });
      }
    }
    index += d[i].count!;
    i++;
  }
  return { changes, unchanged };
};

interface FieldsState {
  data: DataState;
  fields: NestedFields;
}

const getFieldsChanges = (
  schema: Schema,
  store: string,
  id: string,
  state: FieldsState | null,
  newState: FieldsState,
) =>
  keysToObject(
    Array.from(
      new Set([
        ...(state ? Object.keys(state.fields) : []),
        ...Object.keys(newState.fields),
      ]),
    ),
    field => {
      const value = state && getRecordValue(state.data, store, id, field);
      const newValue = getRecordValue(newState.data, store, id, field);
      const nextFields = state && state.fields[field];
      const newNextFields = newState.fields[field];
      if (Array.isArray(newValue)) {
        if (newNextFields === null) {
          const { changes, unchanged } = getArrayChanges(
            value as Value[] | null,
            newValue,
          );
          return state ? changes : unchanged.map(u => u.value);
        }
        const { changes, unchanged } = getArrayChanges(
          value as Value[] | null,
          newValue,
          (id, isNew) =>
            getFieldsChanges(
              schema,
              schema[store][field],
              id as string,
              state && !isNew ? { ...state, fields: nextFields! } : null,
              { ...newState, fields: newNextFields },
            ),
        );
        return state ? [...changes, ...unchanged] : unchanged.map(u => u.value);
      }
      if (newNextFields === null) {
        return state ? (value !== newValue ? newValue : undefined) : newValue;
      }
      return getFieldsChanges(
        schema,
        schema[store][field],
        newValue as string,
        state && { ...state, fields: nextFields! },
        { ...newState, fields: newNextFields },
      );
    },
  );

interface SearchesState {
  data: DataState;
  searches: Search[];
  path: (string | number)[];
}

const getSearchesChanges = (
  schema: Schema,
  state: SearchesState | null,
  newState: SearchesState,
) =>
  keysToObject(
    Array.from(
      new Set(
        [...((state && state.searches) || []), ...newState.searches].map(
          s => s.name,
        ),
      ),
    ),
    name => {
      const search =
        (state && state.searches.find(s => s.name === name)) || null;
      const newSearch = newState.searches.find(s => s.name === name) || null;

      const ids =
        search && getSearchIds(schema, state!.data, state!.path, search);
      const newIds = getSearchIds(
        schema,
        newState.data,
        newState.path,
        newSearch || search!,
      );

      const nestedFields = search
        ? getNestedFields(search.fields.filter(f =>
            Array.isArray(f),
          ) as FieldPath[])
        : {};
      const nextSearches = search
        ? (search.fields.filter(f => !Array.isArray(f)) as Search[])
        : [];

      const newNestedFields = newSearch
        ? getNestedFields(newSearch.fields.filter(f =>
            Array.isArray(f),
          ) as FieldPath[])
        : {};
      const newNextSearches = newSearch
        ? (newSearch.fields.filter(f => !Array.isArray(f)) as Search[])
        : [];

      const { changes, unchanged } = getArrayChanges(
        ids,
        newIds,
        (id, isNew) => ({
          ...getFieldsChanges(
            schema,
            newSearch!.store,
            id,
            state && !isNew ? { data: state.data, fields: nestedFields } : null,
            { data: newState.data, fields: newNestedFields },
          ),
          ...getSearchesChanges(
            schema,
            state && !isNew
              ? {
                  data: state.data,
                  searches: nextSearches,
                  path: [
                    ...state.path,
                    search!.store,
                    hash(search!.filter),
                    hash(search!.sort),
                    hash(search!.slice),
                  ],
                }
              : null,
            {
              data: newState.data,
              searches: newNextSearches,
              path: [
                ...newState.path,
                newSearch!.store,
                hash(newSearch!.filter),
                hash(newSearch!.sort),
                hash(newSearch!.slice),
              ],
            },
          ),
        }),
      );
      return state ? [...changes, ...unchanged] : unchanged.map(u => u.value);
    },
  );

export const emitUpdateChanges = (
  { schema, queries, data }: State,
  newData: DataState,
) => {
  queries.forEach(({ searches, onChange }) => {
    onChange(
      getSearchesChanges(
        schema,
        { data, searches, path: [] },
        { data: newData, searches, path: [] },
      ),
    );
  });
};

export const emitSearchesChanges = (
  { schema, queries, data }: State,
  index: number,
  newSearches: Search[],
) => {
  const { searches, onChange } = queries[index];
  onChange(
    getSearchesChanges(
      schema,
      { data, searches, path: [] },
      { data, searches: newSearches, path: [] },
    ),
  );
};
