import * as peg from 'pegjs';

const parser = peg.generate(String.raw`

start
  = _ main:expr+ _ { return main.reduce((res, e) => Object.assign(res, e), {}); }
  / _ { return {}; }

expr
  = _ o:'-'? f:field _ ',' _ { return { [f]: o ? -1 : 1 }; }
  / _ ',' _ { return {}; }

field
  = '\'' f:[a-z0-9-_]i+ '\'' { return f.join(''); }
  / '"' f:[a-z0-9-_]i+ '"' { return f.join(''); }
  / f:[a-z0-9-_]i+ { return f.join(''); }

_
  = whiteSpace*
__
  = whiteSpace+

whiteSpace
  = [ \t\n\r]+

`).parse;

export default function parseSort(s: string) {
  const sort = parser(`${s},`);
  if (!sort.createdAt) sort.createdAt = -1;
  if (!sort.id) sort.id = 1;

  return sort as { [k: string]: 1 | -1 };
}
