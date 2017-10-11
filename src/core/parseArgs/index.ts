import {
  ArgumentNode,
  GraphQLResolveInfo,
  FieldNode,
  StringValueNode,
  ValueNode,
} from 'graphql';

import { Args, Field, fieldIs, Obj, QueryArgs } from '../typings';
import { keysToObject, undefOr } from '../utils';

import parseFilter from './parseFilter';
import parseSort from './parseSort';

const parseValue = (value: ValueNode, variables: Obj) => {
  if (value.kind === 'Variable') return variables[value.name.value];
  if (value.kind === 'IntValue') return parseInt(value.value, 10);
  return (value as StringValueNode).value;
};
export const parsePlainArgs = (
  argNodes: ArgumentNode[] = [],
  variables: Obj = {},
) =>
  keysToObject(
    argNodes,
    ({ value }) => {
      if (value.kind === 'ListValue') {
        return value.values.map(v => parseValue(v, variables));
      }
      return parseValue(value, variables);
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
    const start = Math.max(args.skip || 0, 0);
    return {
      filter: parseFilter(args.filter, userId, fields),
      sort: parseSort(args.sort),
      start,
      end: undefOr(args.show, start + args.show!),
      fields:
        info &&
        info.fieldNodes[0].selectionSet!.selections
          .map((f: FieldNode) => f.name.value)
          .filter(fieldName => !fieldIs.foreignRelation(fields[fieldName])),
      trace: undefOr(args.trace && args.trace.start, args.trace),
      ids: args.ids,
    };
  } catch (error) {
    return {
      filter: {},
      sort: [],
      start: 0,
      end: 0,
      fields: [],
      trace: { start: 0, end: 0 },
    };
  }
}
