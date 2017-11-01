import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLScalarType,
  ValueNode,
} from 'graphql';
import { Kind } from 'graphql/language';

import { Obj } from './typings';
import { keysToObject } from './utils';

const parseLiteral = (
  ast: ValueNode,
  kinds: { [key: string]: boolean } | null,
) => {
  if (ast.kind === Kind.STRING && (!kinds || kinds[Kind.STRING]))
    return ast.value;
  if (ast.kind === Kind.BOOLEAN && (!kinds || kinds[Kind.BOOLEAN]))
    return ast.value;
  if (ast.kind === Kind.INT && (!kinds || kinds[Kind.INT]))
    return parseInt(ast.value, 10);
  if (ast.kind === Kind.FLOAT && (!kinds || kinds[Kind.FLOAT]))
    return parseFloat(ast.value);
  if (ast.kind === Kind.OBJECT && (!kinds || kinds[Kind.OBJECT])) {
    return keysToObject(
      ast.fields,
      f => parseLiteral(f.value, kinds),
      f => f.name.value,
    );
  }
  if (ast.kind === Kind.LIST && (!kinds || kinds[Kind.LIST])) {
    return ast.values.map(v => parseLiteral(v, kinds));
  }
  return null;
};

interface ScalarConfig {
  decode?: (value: any) => any;
  encode?: (value: any) => any;
  kinds?: string[];
}

export interface Scalar {
  type: GraphQLScalarType;
  decode?: (value: any) => any;
  encode?: (value: any) => any;
}

const buildScalarTypes = (types: Obj<ScalarConfig>) =>
  keysToObject(Object.keys(types), name => ({
    decode: types[name].decode,
    encode: types[name].encode,
    type: new GraphQLScalarType({
      name,
      description: `${name} custom scalar type`,
      serialize: types[name].encode || (value => value),
      parseValue: types[name].decode || (value => value),
      parseLiteral: ast =>
        parseLiteral(
          ast,
          types[name].kinds
            ? keysToObject(types[name].kinds!, () => true)
            : null,
        ),
    }),
  }));

const memoize = (func: (value: any) => any) => {
  const cache: Obj<any> = {};
  return (value: any) => {
    const key = JSON.stringify(value);
    if (cache[key] !== undefined) return cache[key];
    const result = func(value);
    cache[key] = result;
    return result;
  };
};

export default {
  boolean: { type: GraphQLBoolean } as Scalar,
  int: { type: GraphQLInt } as Scalar,
  float: { type: GraphQLFloat } as Scalar,
  string: { type: GraphQLString } as Scalar,
  ...(buildScalarTypes({
    date: {
      encode: value => (value ? new Date(value).getTime() : null),
      decode: memoize(value => new Date(value)),
      kinds: [Kind.INT, Kind.STRING],
    },
    file: {
      kinds: [Kind.STRING],
    },
    json: {},
  }) as { date: Scalar; file: Scalar; json: Scalar }),
};
