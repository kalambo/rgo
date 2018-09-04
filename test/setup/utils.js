const keysToObject = (keys, map, keyMap = k => k) =>
  keys.reduce(
    (res, k) => ({
      ...res,
      [keyMap(k)]: typeof map === 'function' ? map(k) : map,
    }),
    {},
  );

const flatten = arrays => arrays.reduce((res, a) => res.concat(a), []);

const isObject = obj =>
  Object.prototype.toString.call(obj) === '[object Object]';

const unique = items1 => Array.from(new Set(items1));

const uniqueKeys = (obj1, obj2) =>
  unique([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

const merge = (obj1, obj2) => {
  if (isObject(obj1) && isObject(obj2)) {
    return keysToObject(uniqueKeys(obj1, obj2), k => merge(obj1[k], obj2[k]));
  }
  return obj2 === undefined ? obj1 : obj2;
};

const getNestedFields = fields =>
  fields.reduce((result, field) => {
    field.reduce((res, f, i) => {
      if (i === field.length - 1) res[f] = null;
      else res[f] = res[f] || {};
      return res[f];
    }, result);
    return result;
  }, {});

const minValue = (...values) =>
  values.reduce((v1, v2) => {
    if (v1 === undefined || v2 === undefined) return v1 === undefined ? v2 : v1;
    if (v1 === null || v2 === null) return v1 === null ? v2 : v1;
    return v1 < v2 ? v1 : v2;
  });

const maxValue = (...values) =>
  values.reduce((v1, v2) => {
    if (v1 === undefined || v2 === undefined) return v1 === undefined ? v2 : v1;
    if (v1 === null || v2 === null) return v1 === null ? v2 : v1;
    return v1 > v2 ? v1 : v2;
  });

module.exports.keysToObject = keysToObject;
module.exports.flatten = flatten;
module.exports.isObject = isObject;
module.exports.unique = unique;
module.exports.uniqueKeys = uniqueKeys;
module.exports.merge = merge;
module.exports.getNestedFields = getNestedFields;
module.exports.minValue = minValue;
module.exports.maxValue = maxValue;
