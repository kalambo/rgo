export const keysToObject = (keys, valueMap, keyMap = key => key) =>
  keys.reduce((res, key) => {
    const value = valueMap(key);
    if (value === undefined) return res;
    return { ...res, [keyMap(key)]: value };
  }, {});
