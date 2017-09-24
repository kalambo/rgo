import * as _ from 'lodash';

import { Obj, Rules, ScalarName } from './typings';
import { noUndef, transformValue } from './utils';

const formats = {
  email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&''*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
};

const validateSingle = (
  scalar: ScalarName,
  rules: Rules,
  value: any,
  data: Obj,
) => {
  if (scalar === 'file') {
    if (value && value.fileName && !value.fileId) return false;
  }

  if (rules.equals !== undefined && !Array.isArray(rules.equals)) {
    if (value !== rules.equals) return false;
  }

  if (rules.email) {
    if (typeof value !== 'string' || !formats.email.test(value)) return false;
  }

  if (rules.password) {
    if (typeof value !== 'string' || value.length < 10 || value.length > 64) {
      return false;
    }
  }

  if (rules.transform) {
    if (transformValue(value, rules.transform) !== value) return false;
  }

  if (rules.maxWords) {
    if (
      typeof value !== 'string' ||
      (value.match(/\S+/gi) || []).length > rules.maxWords
    ) {
      return false;
    }
  }

  if (rules.lt) {
    const otherValue = noUndef(_.get(data, rules.lt));
    if (otherValue !== null && value >= otherValue) return false;
  }

  if (rules.gt) {
    const otherValue = noUndef(_.get(data, rules.gt));
    if (otherValue !== null && value <= otherValue) return false;
  }

  if (rules.options) {
    if (Array.isArray(rules.options)) {
      if (!rules.options.includes(value)) return false;
    } else {
      if (!Object.keys(rules.options).some(k => rules.options![k] === value)) {
        return false;
      }
    }
  }

  return true;
};

export default function validate(
  scalar: ScalarName,
  rules: Rules = {},
  required: boolean,
  value: any,
  data: Obj,
) {
  if (value === null || (Array.isArray(value) && value.length === 0)) {
    return !required;
  }

  if (rules.equals !== undefined && Array.isArray(rules.equals)) {
    if (!Array.isArray(value) || value.length !== rules.equals.length) {
      return false;
    }
    if (rules.equals.some((v, i) => value[i] !== v)) return false;
  }

  if (rules.minChoices) {
    if (!Array.isArray(value) || value.length < rules.minChoices) {
      return false;
    }
  }

  if (rules.maxChoices) {
    if (!Array.isArray(value) || value.length > rules.maxChoices) {
      return false;
    }
  }

  return Array.isArray(value)
    ? value.every(v => validateSingle(scalar, rules, v, data))
    : validateSingle(scalar, rules, value, data);
}
