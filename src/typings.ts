export type Obj<T = any> = { [key: string]: T };

export type FieldPath = string[];

export type Value = boolean | number | string | Date;

export type FilterUnit =
  | [FieldPath, '=' | '!=', Value | null]
  | [FieldPath, '<' | '>' | '<=' | '>=', Value]
  | [FieldPath, 'in', (Value | null)[]];

export interface FilterArray
  extends Array<'AND' | 'OR' | FilterUnit | FilterArray> {
  [0]: 'AND' | 'OR';
  [index: number]: 'AND' | 'OR' | FilterUnit | FilterArray;
}
export type Filter = FilterUnit | FilterArray;

export const isFilterArray = (filter: Filter): filter is FilterArray =>
  filter[0] === 'AND' || filter[0] === 'OR';

export type Sort = { field: FieldPath; direction: 'ASC' | 'DESC' }[];

export type Slice = { start: number; end?: number };

export interface Search {
  name: string;
  store: string;
  filter?: Filter;
  sort?: Sort;
  slice?: Slice;
  fields: (FieldPath | Search)[];
}

export interface FilterRange {
  start?: Value | null;
  end?: Value | null;
}

export interface NestedFields {
  [key: string]: null | NestedFields;
}

export interface Request {
  store: string;
  selection: [Obj<FilterRange>[], Sort, Slice];
  fields: NestedFields;
  requests: Request[];
}

export type Record = Obj<null | Value | Value[]>;

export type Data = Obj<Obj<Record>>;

export type DataState = {
  server: Data;
  client: Data;
  marks: any;
};

export type Query = { searches: Search[]; onChange: (changes: any) => void };

export type Schema = Obj<Obj<string>>;

export interface State {
  schema: Schema;
  queries: Query[];
  data: DataState;
}
