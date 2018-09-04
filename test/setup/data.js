const {
  flatten,
  keysToObject,
  maxValue,
  minValue,
  uniqueKeys,
} = require('./utils');

const mergeData = (data1, data2) =>
  keysToObject(uniqueKeys(data1, data2), store =>
    keysToObject(uniqueKeys(data1[store], data2[store]), id =>
      keysToObject(
        uniqueKeys(
          data1[store] && data1[store][id],
          data2[store] && data2[store][id],
        ),
        field => {
          const v1 =
            data1[store] && data1[store][id] && data1[store][id][field];
          const v2 =
            data2[store] && data2[store][id] && data2[store][id][field];
          return v2 === undefined ? v1 : v2;
        },
      ),
    ),
  );

const getRecordValue = (schema, data, store, id, field) => {
  if (schema.formulae[store] && schema.formulae[store][field]) {
    const values = schema.formulae[store][field].fields.map(f =>
      getRecordValue(schema, data, store, id, f),
    );
    if (values.some(v => v === undefined)) return undefined;
    return schema.formulae[store][field].formula(...values);
  }
  const value = [store, id, field].reduce((res, k) => res && res[k], data);
  return value === undefined ? null : value;
};

const getValues = (schema, data, store, id, fieldPath) => {
  const [field, ...path] = fieldPath;
  const value = getRecordValue(schema, data, store, id, field);
  const valueArray =
    value === null ? [] : Array.isArray(value) ? value : [value];
  if (!path.length) return valueArray;
  const newStore = schema.links[store][field];
  return flatten(
    valueArray.map(id => getValues(schema, data, newStore, id, path)),
  );
};

const idInFilter = (schema, data, store, id, filter) =>
  filter.some(filterMap =>
    filterMap.every(({ field, range }) =>
      getValues(schema, data, store, id, field).some(
        v =>
          range.length === 1
            ? v === range[0].value
            : maxValue(range[0].value, v) === v &&
              minValue(range[1].value, v) === v,
      ),
    ),
  );

const compareValues = (values1, values2) => {
  for (const i of Array.from({
    length: Math.max(values1.length, values2.length),
  }).map((_, i) => i)) {
    if (values1[i] === undefined || values1[i] < values2[i]) return -1;
    if (values2[i] === undefined || values1[i] > values2[i]) return 1;
  }
  return 0;
};

const compareIds = (schema, data, store, sort) => (id1, id2) =>
  sort.reduce((res, { field, direction }) => {
    if (res !== 0) return res;
    const v1 = getValues(schema, data, store, id1, field);
    const v2 = getValues(schema, data, store, id2, field);
    if (!v1.length && !v2.length) return 0;
    if (!v1.length) return 1;
    if (!v2.length) return -1;
    return (direction === 'ASC' ? 1 : -1) * compareValues(v1, v2);
  }, 0);

module.exports.mergeData = mergeData;
module.exports.getRecordValue = getRecordValue;
module.exports.idInFilter;
module.exports.compareIds;
