import { GraphQLResolveInfo, FieldNode } from 'graphql';
import { Obj } from 'mishmash';

import { Args, Field, QueryArgs } from '../typings';

import parseFilter from './parseFilter';
import parseSort from './parseSort';

export default function parseArgs(
  args: Args,
  userId: string | null,
  fields: Obj<Field>,
  info?: GraphQLResolveInfo,
): QueryArgs {
  try {
    return {
      filter: parseFilter(args.filter, userId, fields),
      sort: parseSort(args.sort),
      skip: args.skip || 0,
      show: args.show !== undefined ? args.show : null,
      fields: info
        ? info.fieldNodes[0].selectionSet!.selections
            .map((f: FieldNode) => f.name.value)
            .filter(f => f !== '__typename')
        : null,
    };
  } catch (error) {
    return { filter: {}, sort: [], skip: 0, show: 0, fields: [] };
  }
}
