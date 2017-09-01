import * as peg from 'pegjs';

import { Field, fieldIs, Obj } from '../typings';
import { isObject, keysToObject, mapArray, mapObject } from '../utils';

import parseDateString from './parseDateString';

const parser = peg.generate(String.raw`

start
  = _ main:or _ { return main[0]; }
  / _ { return {}; }

or
  = lhs:and _ '|' _ rhs:or2 { return [{ $or: lhs.concat(rhs) }]; }
  / and

or2
  = lhs:block _ '|' _ rhs:or2 { return lhs.concat(rhs); }
  / and

and
  = lhs:block _ ',' __ rhs:and2 { return [{ $and: lhs.concat(rhs) }]; }
  / block

and2
  = lhs:block _ ',' __ rhs:and2 { return lhs.concat(rhs); }
  / block

block
  = '(' _ sentence:or _ ')' { return sentence; }
  / statement

statement
  = f:field _ o:op _ e:expr { return [{ [f]: { [o]: e } }]; }
  / '!' _ f:field { return [{ $or: [{ [f]: { $eq: null } }, { [f]: { $eq: false } }] }]; }
  / f:field { return [{ $and: [{ [f]: { $ne: null } }, { [f]: { $ne: false } }] }]; }

field
  = '\'' f:[a-z0-9-_]i+ '\'' { return f.join(''); }
  / '"' f:[a-z0-9-_]i+ '"' { return f.join(''); }
  / f:[a-z0-9-_]i+ { return f.join(''); }

op
  = '!=' { return '$ne'; }
  / '<=' { return '$lte'; }
  / '>=' { return '$gte'; }
  / '=' { return '$eq'; }
  / '<' { return '$lt'; }
  / '>' { return '$gt'; }

expr
  = '\'' t:[^']* '\'' { return t.join('').trim(); }
  / '"' t:[^"]i* '"' { return t.join('').trim(); }
  / t:[^'",|()]* { return t.join('').trim(); }

_
  = whiteSpace*
__
  = whiteSpace+

whiteSpace
  = [ \t\n\r]+

`).parse;

const typeMaps = {
  boolean: v => mapArray(v, x => ({ true: true, false: false }[x] || null)),
  int: v => mapArray(v, x => parseInt(x, 10)),
  float: v => mapArray(v, x => parseFloat(x)),
  date: v => mapArray(v, x => parseDateString(x)),
};

export default function parseFilter(
  s: string = '',
  userId: string | null,
  fields: Obj<Field>,
) {
  return mapObject(
    parser(s.replace(/\$user/g, userId || '').replace(/OR/g, '|')),
    {
      valueMaps: keysToObject(Object.keys(fields), k => {
        const field = fields[k];
        return typeMaps[fieldIs.scalar(field) ? field.scalar : ''] || true;
      }),
      continue: v => isObject(v) && Object.keys(v).some(k => k[0] === '$'),
    },
  );
}
