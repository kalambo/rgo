export type Obj<T = any> = { [key: string]: T };

export type ScalarName =
  | 'Boolean'
  | 'Int'
  | 'Float'
  | 'String'
  | 'Date'
  | 'File'
  | 'JSON';

export type Data = Obj<Obj<Obj | null>>;

export interface Args {
  filter?: string;
  sort?: string;
  skip?: number;
  show?: number;
  info?: {
    extraSkip: number;
    extraShow: number;
    traceSkip: number;
    traceShow?: number;
  };
}

export interface QueryArgs {
  filter: any;
  sort: [string, 'asc' | 'desc'][];
  skip: number;
  show: number | null;
  fields: string[] | null;
  trace?: { skip: number; show: number | null };
}

export type Formula = (
  obj: any,
  query: (args: QueryArgs) => Promise<any[]>,
) => Promise<any> | any;

export interface ScalarField {
  scalar: ScalarName;
  isList?: true;
  rules?: Obj;
  formula?: Formula | true;
}
export interface RelationField {
  type: string;
  isList?: true;
}
export interface ForeignRelationField {
  type: string;
  foreign: string;
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

export interface DataKey {
  type: string;
  id: string;
  field?: string;
}

export interface QueryResult {
  data: Data;
  firstIds: Obj<Obj<string>>[];
}
