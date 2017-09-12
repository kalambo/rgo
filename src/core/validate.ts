import * as _ from 'lodash';

import { Obj, Rules, ScalarName } from './typings';
import { noUndef } from './utils';

const formats = {
  email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&''*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
};

const isEmail = (value: any) =>
  typeof value === 'string' && formats.email.test(value);

const validateSingle = (
  scalar: ScalarName,
  rules: Rules,
  value: any,
  data: Obj,
) => {
  if (scalar === 'file') {
    if (value && value.fileName && !value.fileId) return false;
  }

  if (rules.equals !== undefined) {
    if (value !== rules.equals) return false;
  }

  if (rules.email) {
    if (Array.isArray(value)) {
      if (value.some(v => !isEmail(v))) return false;
    } else {
      if (!isEmail(value)) return false;
    }
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
    if (!rules.options.includes(value)) return false;
  }

  return true;
};

export default function validate(
  scalar: ScalarName,
  rules: Rules = {},
  value: any,
  data: Obj,
) {
  if (value === null) return true;

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
