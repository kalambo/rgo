import { Obj } from 'mishmash';

export type ScalarName = 'ID' | 'Boolean' | 'Int' | 'Float' | 'String' | 'Date' | 'File' | 'JSON';

export interface QueryArgs {
  filter: any;
  sort: any;
  skip: number;
  show: number | null;
  fields: string[] | null;
}

export type Formula = (obj: any, query: (args: QueryArgs) => Promise<any[]>) => Promise<any> | any;

export interface ScalarField {
  scalar: ScalarName;
  isList?: true;
  rules?: Obj;
  formula?: Formula | true;
}
export interface RelationField {
  relation: { type: string };
  isList?: true;
}
export interface ForeignRelationField {
  relation: { type: string, field: string };
}
export type Field = ScalarField | RelationField | ForeignRelationField;

export const fieldIs = {
  scalar: (field: Field): field is ScalarField => {
    return !!(field as ScalarField).scalar;
  },
  relation: (field: Field): field is RelationField => {
    return !!(field as RelationField).relation && !(field as ForeignRelationField).relation.field;
  },
  foreignRelation: (field: Field): field is ForeignRelationField => {
    return !!(field as RelationField).relation && !!(field as ForeignRelationField).relation.field;
  },
};

export interface DataKey {
  type: string;
  field: string;
  id: string;
}
