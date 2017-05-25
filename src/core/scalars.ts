import {
  GraphQLID, GraphQLBoolean, GraphQLInt, GraphQLFloat, GraphQLNonNull, GraphQLString,
  GraphQLScalarType, ValueNode,
} from 'graphql';
import { Kind } from 'graphql/language';
import { keysToObject, Obj } from 'mishmash';

const parseLiteral = (ast: ValueNode, kinds: { [key: string]: boolean } | null) => {
  if (ast.kind === Kind.STRING && (!kinds || kinds[Kind.STRING])) return ast.value;
  if (ast.kind === Kind.BOOLEAN && (!kinds || kinds[Kind.BOOLEAN])) return ast.value;
  if (ast.kind === Kind.INT && (!kinds || kinds[Kind.INT])) return parseInt(ast.value, 10);
  if (ast.kind === Kind.FLOAT && (!kinds || kinds[Kind.FLOAT])) return parseFloat(ast.value);
  if (ast.kind === Kind.OBJECT && (!kinds || kinds[Kind.OBJECT])) {
    return keysToObject(ast.fields, f => parseLiteral(f.value, kinds), f => f.name.value);
  }
  if (ast.kind === Kind.LIST && (!kinds || kinds[Kind.LIST])) {
    return ast.values.map(v => parseLiteral(v, kinds));
  }
  return null;
}

interface ScalarConfig {
  decode: (value: any) => any;
  encode: (value: any) => any;
  kinds?: string[];
}

export interface Scalar {
  type: GraphQLNonNull<GraphQLScalarType> | GraphQLScalarType,
  decode?: (value: any) => any;
  encode?: (value: any) => any;
}

const buildScalarTypes = (types: Obj<ScalarConfig>) => keysToObject(
  Object.keys(types).map(name => ({
    name,
    ...types[name],
    kinds: types[name].kinds ? keysToObject(types[name].kinds!, () => true) : null,
  })),
  ({ name, decode, encode, kinds }) => ({
    type: new GraphQLScalarType({
      name,
      description: `${name} custom scalar type`,
      parseValue: (value) => decode(value),
      serialize: (value) => encode(value),
      parseLiteral: (ast) => parseLiteral(ast, kinds),
    }),
    decode,
    encode,
  }),
  ({ name }) => name,
);

export default {
  ID: { type: new GraphQLNonNull(GraphQLID) },
  Boolean: { type: GraphQLBoolean },
  Int: { type: GraphQLInt },
  Float: { type: GraphQLFloat },
  String: { type: GraphQLString },
  ...buildScalarTypes({
    Date: {
      decode: value => new Date(value),
      encode: value => value ? (new Date(value)).getTime() : null,
      kinds: [Kind.INT, Kind.STRING],
    },
    File: {
      decode: value => `${value.fileId}:${value.fileName}`,
      encode: value => {
        const [fileId, fileName] = value.split(/\:(.+)$/);
        return { fileId, fileName };
      },
      kinds: [Kind.STRING],
    },
    JSON: {
      decode: value => value,
      encode: value => value,
    },
  }),
} as Obj<Scalar>;
