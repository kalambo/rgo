import { GraphQLResolveInfo, FieldNode } from 'graphql';
import { Obj } from 'mishmash';

import mapObject from '../mapObject';
import { Field, QueryArgs } from '../typings';

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
  Boolean: v => ({ true: true, false: false }[v] || null),
  Int: v => parseInt(v, 10),
  Float: v => parseFloat(v),
  Date: v => parseDateString(v),
};

export default function parseArgs(
  args: Args, user: string | null, fields: Obj<Field>, info?: GraphQLResolveInfo,
): QueryArgs {

  try {
    return {
      filter: mapObject(parseFilter(args.filter || '', user), { fields, typeMaps }),
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
