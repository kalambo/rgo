import * as peg from 'pegjs';

const parser = peg.generate(String.raw`

start
  = _ main:expr+ _ { return main; }
  / _ { return []; }

expr
  = _ o:'-'? f:field _ ','? _ { return [f, o ? 'desc' : 'asc']; }

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
  const sort = parser(s) as [string, 'asc' | 'desc'][];
  if (!sort.some(([f]) => f === 'createdAt')) sort.push(['createdAt', 'desc']);
  if (!sort.some(([f]) => f === 'id')) sort.push(['id', 'asc']);

  return sort;
}
