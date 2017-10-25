import { ArgumentNode, StringValueNode } from 'graphql';
import * as peg from 'pegjs';

import {
  Field,
  fieldIs,
  FullArgs,
  keysToObject,
  Obj,
  ScalarName,
} from '../core';

const parser = peg.generate(String.raw`

start
= _ main:or _ { return main[0]; }
/ _ { return {}; }

or
= lhs:and _ '|' _ rhs:or2 { return [['or'].concat(lhs).concat(rhs)]; }
/ and

or2
= lhs:block _ '|' _ rhs:or2 { return lhs.concat(rhs); }
/ and

and
= lhs:block _ ',' _ rhs:and2 { return [['and'].concat(lhs).concat(rhs)]; }
/ block

and2
= lhs:block _ ',' _ rhs:and2 { return lhs.concat(rhs); }
/ block

block
= '(' _ sentence:or _ ')' { return sentence; }
/ statement

statement
= f:field _ o:op _ e:expr { return [[f, o, e]]; }
/ '!' _ f:field { return [[f, '=', 'null']]; }
/ f:field { return [[f, '!=', 'null']]; }

field
= '\'' f:[a-z0-9-_]i+ '\'' { return f.join(''); }
/ '"' f:[a-z0-9-_]i+ '"' { return f.join(''); }
/ f:[a-z0-9-_]i+ { return f.join(''); }

op
= '!=' / '<=' / '>=' / '=' / '<' / '>' { return text(); }

expr
= '\'' t:[^']* '\'' { return t.join('').trim(); }
/ '"' t:[^"]i* '"' { return t.join('').trim(); }
/ '[' t:[^\]]i* ']' { return t.join('').split(',').map(function(s) { return s.trim() }); }
/ t:[^'",|()]* { return t.join('').trim(); }

_
= whiteSpace*

whiteSpace
= [ \t\n\r]+

`).parse;

const parseValue = (value: string, scalar: ScalarName) => {
  if (value === 'null') return null;
  if (scalar === 'boolean') return { true: true, false: false }[value];
  if (scalar === 'int') return parseInt(value, 10);
  if (scalar === 'float') return parseFloat(value);
  if (scalar === 'date') {
    const parts = value
      .split(/^(\d\d?)\/(\d\d?)\/(\d\d(?:\d\d)?)$/)
      .slice(1)
      .map(parseFloat);
    if (parts.length === 0) return null;

    const dd = parts[0];
    const mm = parts[1] - 1;
    const yy = parts[2] + (parts[2] < 100 ? (parts[2] < 30 ? 2000 : 1900) : 0);

    const d = new Date(yy, mm, dd);
    if (d.getDate() !== dd || d.getMonth() !== mm || d.getFullYear() !== yy)
      return null;

    return d;
  }
  return value;
};

const parseFilterValues = (filter: any[], fields: Obj<Field>) => {
  if (Array.isArray(filter[1] || [])) {
    return [
      filter[0],
      ...filter.slice(1).map(f => parseFilterValues(f, fields)),
    ];
  }
  const [fieldName, op, value] = filter;
  const field = fields[fieldName];
  const scalar = fieldIs.scalar(field) ? field.scalar : 'string';
  if (scalar === 'boolean' && (op === '=' || op === '!=') && value === 'null') {
    return [
      op === '=' ? 'or' : 'and',
      [[fieldName, op, null], [fieldName, op, false]],
    ];
  }
  return [fieldName, op, parseValue(value, scalar)];
};

export default function parseArgs(
  args: Obj | ArgumentNode[] = [],
  fields: Obj<Field>,
  allowNullSort: boolean,
): FullArgs {
  const result = Array.isArray(args)
    ? keysToObject(
        args,
        ({ value }) =>
          value.kind === 'IntValue'
            ? parseInt(value.value, 10)
            : (value as StringValueNode).value,
        ({ name }) => name.value,
      )
    : args;
  if (result.filter && typeof result.filter === 'string') {
    result.filter = parseFilterValues(
      parser(result.filter.replace(/\sOR\s/g, ' | ')),
      fields,
    );
  }
  if (result.sort && typeof result.sort === 'string') {
    result.sort = result.sort.split(/[\s,]+/);
  }
  if (!allowNullSort) result.sort = result.sort || [];
  if (result.sort) {
    if (!result.sort.some(s => s.replace('-', '') === 'createdat')) {
      result.sort.push('-createdat');
    }
    if (!result.sort.some(s => s.replace('-', '') === 'id')) {
      result.sort.push('id');
    }
  }
  return result;
}
