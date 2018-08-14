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

const getFieldsChanges = (
  schema: Schema,
  data: DataState | null,
  newData: DataState,
  store: string,
  id: string,
  fields: NestedFields,
) =>
  keysToObject(Object.keys(fields), field => {
    const value = data && getRecordValue(data, store, id, field);
    const newValue = getRecordValue(newData, store, id, field);
    const nextFields = fields[field];
    if (Array.isArray(newValue)) {
      if (nextFields === null) {
        const { changes, unchanged } = getArrayChanges(
          value as Value[] | null,
          newValue,
        );
        return data ? changes : unchanged.map(u => u.value);
      }
      const { changes, unchanged } = getArrayChanges(
        value as Value[] | null,
        newValue,
        (id, isNew) =>
          getFieldsChanges(
            schema,
            isNew ? null : data,
            newData,
            schema[store][field],
            id as string,
            nextFields,
          ),
      );
      return data ? [...changes, ...unchanged] : unchanged.map(u => u.value);
    }
    if (nextFields === null) {
      return data ? (value !== newValue ? newValue : undefined) : newValue;
    }
    return getFieldsChanges(
      schema,
      data,
      newData,
      schema[store][field],
      newValue as string,
      nextFields,
    );
  });

const getSearchesChanges = (
  schema: Schema,
  data: DataState | null,
  newData: DataState,
  path: (string | number)[],
  searches: Search[],
) =>
  keysToObject(
    searches,
    search => {
      const ids = data && getSearchIds(schema, data, path, search);
      const newIds = getSearchIds(schema, newData, path, search);
      const nestedFields = getNestedFields(search.fields.filter(f =>
        Array.isArray(f),
      ) as FieldPath[]);
      const nextSearches = search.fields.filter(
        f => !Array.isArray(f),
      ) as Search[];
      const { changes, unchanged } = getArrayChanges(
        ids,
        newIds,
        (id, isNew) => ({
          ...getFieldsChanges(
            schema,
            isNew ? null : data,
            newData,
            search.store,
            id,
            nestedFields,
          ),
          ...getSearchesChanges(
            schema,
            isNew ? null : data,
            newData,
            [
              ...path,
              search.store,
              hash(search.filter),
              hash(search.sort),
              hash(search.slice),
            ],
            nextSearches,
          ),
        }),
      );
      return data ? [...changes, ...unchanged] : unchanged.map(u => u.value);
    },
    search => search.name,
  );

export const emitChanges = (
  { schema, queries, data }: State,
  newData: DataState,
) => {
  queries.forEach(({ searches, onChange }) => {
    onChange(getSearchesChanges(schema, data, newData, [], searches));
  });
};
