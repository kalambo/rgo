import { ScalarName } from '../../core';

const mapValue = (v: any, func: (v) => any) => Array.isArray(v) ? v.map(func) : func(v);

export const decodeScalar = (scalar: ScalarName, value: any) => {

  if (value === null) return value;

  if (scalar === 'Date') return mapValue(value, v => new Date(v));

  return value;

};
export const encodeScalar = (scalar: ScalarName, value: any) => {

  if (value === null) return value;

  if (scalar === 'Date') return mapValue(value, v => v.getTime());

  return value;

};
