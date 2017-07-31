import {
  ArgumentNode,
  GraphQLResolveInfo,
  FieldNode,
  StringValueNode,
} from 'graphql';

import { Args, Field, Obj, QueryArgs } from '../typings';
import { keysToObject } from '../utils';

import parseFilter from './parseFilter';
import parseSort from './parseSort';

export const parsePlainArgs = (argNodes: ArgumentNode[] = [], variables: Obj) =>
  keysToObject(
    argNodes,
    ({ value }) => {
      if (value.kind === 'Variable') return variables[value.name.value];
      if (value.kind === 'IntValue') return parseInt(value.value, 10);
      return (value as StringValueNode).value;
    },
    ({ name }) => name.value,
  ) as Args;

export default function parseArgs(
  args: Args,
  userId: string | null,
  fields: Obj<Field>,
  info?: GraphQLResolveInfo,
): QueryArgs {
  try {
    const extraSkip = (args.info && args.info.extraSkip) || 0;
    const extraShow = (args.info && args.info.extraShow) || 0;
    return {
      filter: parseFilter(args.filter, userId, fields),
      sort: parseSort(args.sort),
      skip: Math.max((args.skip || 0) - extraSkip, 0),
      show: args.show !== undefined ? args.show + extraSkip + extraShow : null,
      fields: info
        ? info.fieldNodes[0].selectionSet!.selections
            .map((f: FieldNode) => f.name.value)
            .filter(f => f !== '__typename')
        : null,
      trace:
        args.info && args.info.traceSkip !== null
          ? {
              skip: args.info.traceSkip,
              show:
                args.info.traceShow !== undefined ? args.info.traceShow : null,
            }
          : null,
    };
  } catch (error) {
    return {
      filter: {},
      sort: [],
      skip: 0,
      show: 0,
      fields: [],
      trace: { skip: 0, show: 0 },
    };
  }
}
