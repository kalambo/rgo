import { GraphQLError } from 'graphql';

export type Obj<T = any> = { [key: string]: T };

export type ScalarName =
  | 'boolean'
  | 'int'
  | 'float'
  | 'string'
  | 'date'
  | 'file'
  | 'json';

export type Data = Obj<Obj<Obj | null>>;

export interface Args {
  filter?: any[];
  sort?: [string, 'asc' | 'desc'][];
  start?: number;
  end?: number;
  offset?: number;
  trace?: { start: number; end?: number };
  fields?: string[];
}

export interface ScalarField {
  scalar: ScalarName;
  isList?: true;
  meta?: any;
}
export interface RelationField {
  type: string;
  isList?: true;
  meta?: any;
}
export interface ForeignRelationField {
  type: string;
  foreign: string;
  meta?: any;
}
export type Field = ScalarField | RelationField | ForeignRelationField;

export const fieldIs = {
  scalar: (field: Field): field is ScalarField => {
    return !!(field as ScalarField).scalar;
  },
  relation: (field: Field): field is RelationField => {
    return (
      !!(field as RelationField).type &&
      !(field as ForeignRelationField).foreign
    );
  },
  foreignRelation: (field: Field): field is ForeignRelationField => {
    return (
      !!(field as RelationField).type &&
      !!(field as ForeignRelationField).foreign
    );
  },
};

export interface QueryRequest {
  query: string;
  variables?: any;
  normalize?: boolean;
}

export interface QueryResponse {
  data?: any;
  errors?: GraphQLError[];
  firstIds?: Obj<Obj<string>>;
  newIds?: Obj<Obj<string>>;
}
