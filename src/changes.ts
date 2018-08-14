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
import { getNestedFields } from './utils';

type Change<T> = { index: number; added?: T[]; removed?: number; value?: any };

const getArrayChanges = <T = any>(
  array1: T[],
  array2: T[],
  mapAdded?: (v: T) => any,
  mapUnchanged?: (v: T) => any,
) => {
  const d = diffArrays(array1, array2);
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
        ...(added ? { added: mapAdded ? added.map(mapAdded) : added } : {}),
        ...(removed ? { removed } : {}),
      });
      if (added) index += added.length;
      if (removed) index += removed;
      if (d2.added || d2.removed) i++;
    } else {
      for (let j = 0; j < d[i].count!; j++) {
        const v = array2[index + j];
        unchanged.push({
          index: index + j,
          value: mapUnchanged ? mapUnchanged(v) : v,
        });
      }
    }
    index += d[i].count!;
    i++;
  }
  return { changes, unchanged };
};

const getFieldsValue = (
  schema: Schema,
  data: DataState,
  store: string,
  id: string,
  fields: NestedFields,
) =>
  keysToObject(Object.keys(fields), field => {
    const value = getRecordValue(data, store, id, field);
    const nextFields = fields[field];
    if (nextFields === null) return value;
    if (Array.isArray(value)) {
      return value.map(id =>
        getFieldsValue(
          schema,
          data,
          schema[store][field],
          id as string,
          nextFields,
        ),
      );
    }
    return getFieldsValue(
      schema,
      data,
      schema[store][field],
      value as string,
      nextFields,
    );
  });

const getFieldsChanges = (
  schema: Schema,
  data: DataState,
  newData: DataState,
  store: string,
  id: string,
  fields: NestedFields,
) =>
  keysToObject(Object.keys(fields), field => {
    const v1 = getRecordValue(data, store, id, field);
    const v2 = getRecordValue(newData, store, id, field);
    const nextFields = fields[field];
    if (Array.isArray(v1)) {
      if (nextFields === null) {
        return getArrayChanges(v1, v2 as Value[]).changes;
      }
      const { changes, unchanged } = getArrayChanges(
        v1,
        v2 as Value[],
        id => getFieldsValue(schema, newData, store, id as string, nextFields),
        id =>
          getFieldsChanges(
            schema,
            data,
            newData,
            schema[store][field],
            id as string,
            nextFields,
          ),
      );
      return [...changes, ...unchanged];
    }
    if (v1 !== v2) {
      if (nextFields === null) return v2;
      return getFieldsValue(schema, newData, store, v2 as string, nextFields);
    }
    if (nextFields === null) return undefined;
    return getFieldsChanges(
      schema,
      data,
      newData,
      schema[store][field],
      v2 as string,
      nextFields,
    );
  });

const getSearchesValue = (
  schema: Schema,
  data: DataState,
  searches: Search[],
) =>
  searches.reduce((res, search) => {
    const ids = getSearchIds(schema, data, search);
    const nestedFields = getNestedFields(search.fields.filter(f =>
      Array.isArray(f),
    ) as FieldPath[]);
    const nextSearches = search.fields.filter(
      f => !Array.isArray(f),
    ) as Search[];
    return {
      ...res,
      [search.name]: ids.map(id => ({
        ...getFieldsValue(schema, data, search.store, id, nestedFields),
        ...getSearchesValue(schema, data, nextSearches),
      })),
    };
  }, {});

const getSearchesChanges = (
  schema: Schema,
  data: DataState,
  newData: DataState,
  searches: Search[],
) =>
  searches.reduce((res, search) => {
    const ids = getSearchIds(schema, data, search);
    const newIds = getSearchIds(schema, data, search);
    const nestedFields = getNestedFields(search.fields.filter(f =>
      Array.isArray(f),
    ) as FieldPath[]);
    const nextSearches = search.fields.filter(
      f => !Array.isArray(f),
    ) as Search[];
    const { changes, unchanged } = getArrayChanges(
      ids,
      newIds,
      id => ({
        ...getFieldsValue(schema, newData, search.store, id, nestedFields),
        ...getSearchesValue(schema, newData, nextSearches),
      }),
      id => ({
        ...getFieldsChanges(
          schema,
          data,
          newData,
          search.store,
          id,
          nestedFields,
        ),
        ...getSearchesChanges(schema, data, newData, nextSearches),
      }),
    );
    return { ...res, [search.name]: [...changes, ...unchanged] };
  }, {});

export const emitChanges = (
  { schema, queries, data }: State,
  newData: DataState,
) => {
  queries.forEach(({ searches, onChange }) => {
    onChange(getSearchesChanges(schema, data, newData, searches));
  });
};
