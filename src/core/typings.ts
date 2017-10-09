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
  filter?: string;
  sort?: string;
  skip?: number;
  show?: number;
  offset?: number;
  trace?: {
    start?: number;
    end?: number;
  };
  ids?: string[];
}

export interface QueryArgs {
  filter: any;
  sort: [string, 'asc' | 'desc'][];
  start: number;
  end?: number;
  fields?: string[];
  trace?: { start: number; end?: number };
  ids?: string[];
}

export interface ScalarField {
  scalar: ScalarName;
  isList?: true;
  rules?: any;
}
export interface RelationField {
  type: string;
  isList?: true;
  rules?: any;
}
export interface ForeignRelationField {
  type: string;
  foreign: string;
  rules?: any;
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
