export type Obj<T = any> = { [key: string]: T };

export type FieldPath = string[];

export type Value = boolean | number | string | Date;

export type FilterUnit = { field: FieldPath } & (
  | {
      operation: '=' | '!=';
      value: Value | null;
    }
  | {
      operation: '<' | '>' | '<=' | '>=';
      value: Value;
    }
  | {
      operation: 'in';
      value: Value[];
    });
export interface FilterArray
  extends Array<'AND' | 'OR' | FilterUnit | FilterArray> {
  [0]: 'AND' | 'OR';
  [index: number]: 'AND' | 'OR' | FilterUnit | FilterArray;
}
export type Filter = FilterUnit | FilterArray;

export const isFilterArray = (filter: Filter): filter is FilterArray =>
  Array.isArray(filter);

export type Sort = { field: FieldPath; direction: 'Asc' | 'Desc' }[];

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
  start?: Value;
  end?: Value;
}

export type FilterBox = Map<FieldPath, FilterRange>;

export interface SelectionFields {
  [key: string]: null | SelectionFields;
}

export interface Selection {
  store: string;
  all: Set<FilterBox>;
  pages: Map<FilterBox, Map<Sort, Set<Slice>>>;
  fields: SelectionFields;
  searches: Selection[];
}

export type Record = Obj<null | Value | Value[]>;

export type Data = Obj<Obj<Record>>;

export type Query = { searches: Search[]; onChange: (changes: any) => {} };

export type Schema = Obj<Obj<string>>;

export interface State {
  schema: Schema;
  queries: Query[];
  server: Data;
  client: Data;
}
