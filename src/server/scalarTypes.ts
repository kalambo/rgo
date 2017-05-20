import {
  GraphQLID, GraphQLBoolean, GraphQLInt, GraphQLFloat, GraphQLString, GraphQLScalarType,
} from 'graphql';
import { Kind } from 'graphql/language';

const dateScalar = new GraphQLScalarType({
  name: 'Date',
  description: 'Date custom scalar type',
  parseValue(value) { // value received by the server
    return new Date(value);
  },
  serialize(value) { // value sent to the client
    if (!value) return null;
    if (value.getTime) return value.getTime();
    return (new Date(value)).getTime();
  },
  parseLiteral(ast) { // ast value is always in string format
    if (ast.kind === Kind.INT) {
      return parseInt((ast as any).value, 10);
    }
    if (ast.kind === Kind.STRING) {
      return (ast as any).value;
    }
    return null;
  },
});

const fileScalar = new GraphQLScalarType({
  name: 'File',
  description: 'File custom scalar type',
  parseValue(value) {
    return `${value.fileId}:${value.fileName}`; // value received by the server
  },
  serialize(value) {
    const [fileId, fileName] = value.split(/\:(.+)$/);
    return { fileId, fileName }; // value sent to the client
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return (ast as any).value; // ast value is always in string format
    }
    return null;
  },
});

const jsonParseLiteral = (ast) => {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT: {
      const value = Object.create(null);
      ast.fields.forEach((field) => {
        value[field.name.value] = jsonParseLiteral(field.value);
      });
      return value;
    }
    case Kind.LIST:
      return ast.values.map(jsonParseLiteral);
    default:
      return null;
  }
};

const jsonScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  parseValue(value) {
    return value; // value received by the server
  },
  serialize(value) {
    return value; // value sent to the client
  },
  parseLiteral: jsonParseLiteral,
});

export default {
  ID: GraphQLID,
  Boolean: GraphQLBoolean,
  Int: GraphQLInt,
  Float: GraphQLFloat,
  String: GraphQLString,
  Date: dateScalar,
  File: fileScalar,
  JSON: jsonScalar,
};
