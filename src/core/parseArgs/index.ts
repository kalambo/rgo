import { GraphQLResolveInfo, FieldNode } from 'graphql';
import { keysToObject, Obj } from 'mishmash';

import { Field, fieldIs, QueryArgs } from '../typings';
import { isObject, mapArray, mapObject } from '../utils';

import parseDateString from './parseDateString';
import parseFilter from './parseFilter';
import parseSort from './parseSort';

export {
  parseFilter,
  parseSort,
};

export interface Args {
  filter?: string;
  sort?: string;
  skip?: number;
  show?: number;
}

const typeMaps = {
  Boolean: v => mapArray(v, x => ({ true: true, false: false }[x] || null)),
  Int: v => mapArray(v, x => parseInt(x, 10)),
  Float: v => mapArray(v, x => parseFloat(x)),
  Date: v => mapArray(v, x => parseDateString(x)),
};

export default function parseArgs(
  args: Args, user: string | null, fields: Obj<Field>, info?: GraphQLResolveInfo,
): QueryArgs {

  try {
    return {
      filter: mapObject(parseFilter(args.filter || '', user), {
        valueMaps: keysToObject(Object.keys(fields), k => {
          const field = fields[k];
          return typeMaps[fieldIs.scalar(field) ? field.scalar : ''];
        }),
        continue: v => isObject(v) && Object.keys(v).some(k => k[0] === '$'),
      }),
      sort: parseSort(args.sort || ''),
      skip: args.skip || 0,
      show: (args.show !== undefined) ? args.show : null,
      fields: info ? info.fieldNodes[0].selectionSet!.selections.map(
        (f: FieldNode) => f.name.value,
      ).filter(f => f !== '__typename') : null,
    };
  } catch (error) {
    return { filter: {}, sort: {}, skip: 0, show: 0, fields: [] };
  }
}
