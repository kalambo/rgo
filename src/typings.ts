export type Obj<T = any> = { [key: string]: T };

export type ArrayChange<T> = {
  index: number;
  added?: T[];
  removed?: number;
  value?: any;
};

export type FieldPath = string[];

export type Value = boolean | number | string | Date;

export type UserFilterUnit =
  | [FieldPath, '=' | '!=', Value | null | { parent: string }]
  | [FieldPath, '<' | '>' | '<=' | '>=', Value | { parent: string }]
  | [FieldPath, 'in', (Value | null | { parent: string })[]];

export interface UserFilterArray
  extends Array<'AND' | 'OR' | UserFilterUnit | UserFilterArray> {
  [0]: 'AND' | 'OR';
  [index: number]: 'AND' | 'OR' | UserFilterUnit | UserFilterArray;
}
export type UserFilter = UserFilterUnit | UserFilterArray;

export const isFilterArray = (filter: UserFilter): filter is UserFilterArray =>
  filter[0] === 'AND' || filter[0] === 'OR';

export type Sort = { field: FieldPath; direction: 'ASC' | 'DESC' }[];

export type Slice = { start: number; end?: number };

export interface UserSearch {
  name: string;
  store: string;
  filter?: UserFilter;
  sort?: Sort;
  slice?: Slice;
  fields: (FieldPath | UserSearch)[];
}

export interface FilterRange {
  start: {
    value?: Value | null;
    fields: string[];
  };
  end: {
    value?: Value | null;
    fields: string[];
  };
}

export type Filter = Obj<FilterRange>[];

export interface NestedFields {
  [key: string]: null | NestedFields;
}

export interface Search {
  name?: string;
  store: string;
  filter: Filter;
  sort: Sort;
  slice: Slice[];
  fields: FieldPath[];
  searches: Search[];
}

export type RecordValue = null | Value | Value[];

export interface Formula {
  fields: string[];
  formula: (...values: RecordValue[]) => RecordValue;
}

export interface Schema {
  links: Obj<Obj<string>>;
  formulae: Obj<Obj<Formula>>;
}

export type Query = {
  searches: Search[];
  onChange: (changes: any) => void;
};

export type Record = Obj<RecordValue>;

export type Data = Obj<Obj<Record>>;

export type Range = {
  id?: string;
  start: number;
  end?: number;
};

export type DataRanges = Obj<
  {
    filter: Filter;
    sort: Sort;
    ranges: Range[];
  }[]
>;

export type DataState = {
  server: Data;
  client: Data;
  ranges: DataRanges;
};

export interface State {
  schema: Schema;
  queries: Query[];
  data: DataState;
  requests: Obj<Search[]>;
}
