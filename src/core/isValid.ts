import { noUndef } from './utils';

const formats = {
  email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&''*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i,
};

const isEmail = (value: any) =>
  typeof value === 'string' && formats.email.test(value);

export default function isValid(
  scalar: string = '',
  rules: any = {},
  value: any,
  obj: any = {},
) {
  if (value === null) return false;

  if (scalar === 'File') {
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

  if (rules.lt) {
    const otherValue = noUndef(obj[rules.lt]);
    if (otherValue !== null && value >= otherValue) return false;
  }

  if (rules.gt) {
    const otherValue = noUndef(obj[rules.gt]);
    if (otherValue !== null && value <= otherValue) return false;
  }

  return true;
}
