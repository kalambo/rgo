export type Obj<T = any> = { [key: string]: T };

export type Scalar = 'bool' | 'int' | 'float' | 'string' | 'date';

export type Value = null | boolean | number | string | Date;

export type Record = Obj<Value | Value[]>;

export type Data = Obj<Obj<Record>>;

export type NullData = Obj<Obj<null | Record>>;

export interface ScalarField {
  scalar: Scalar;
  isList: boolean;
  formula?: { fields: string[]; map: (...args) => Value | Value[] };
}
export interface LinkField {
  store: string;
  isList: boolean;
}
export type Field = ScalarField | LinkField;

export type Schema = Obj<Obj<Field>>;

export type FilterUnit =
  | [string, '=' | '!=', Value | null | { field: string }]
  | [string, '<' | '>' | '<=' | '>=', Value | { field: string }]
  | [string, 'in', (Value | null | { field: string })[]];

export interface FilterArray
  extends Array<'AND' | 'OR' | FilterUnit | FilterArray> {
  [0]: 'AND' | 'OR';
  [index: number]: 'AND' | 'OR' | FilterUnit | FilterArray;
}
export type Filter = FilterUnit | FilterArray;

export interface Slice {
  start: number;
  end?: number;
}

export interface Search {
  name: string;
  store: string;
  filter?: Filter;
  sort?: string | string[];
  slice?: Slice;
  fields: (string | Search)[];
}

export type ListChange<A, B> = { index: number } & (
  | { add: A[] }
  | { change: B }
  | { remove: number });

export type SetValue = Value | SetRecord;

export interface SetRecord {
  [key: string]: SetValue | (undefined | SetValue)[];
}

export type ChangeValue = SetValue | Change;

export interface Change {
  [key: string]:
    | undefined
    | SetValue
    | (undefined | SetValue)[]
    | Change
    | ListChange<undefined | SetValue, ChangeValue>[];
}

export type Range =
  | { id: string; start: number; end?: number }
  | { end?: number };

export type Ranges = { filter } | { filter; sort; ranges: Range[] };

export interface Rgo {
  query: (searches: Search[], onChange: (change: Change) => void) => void;
}

export interface FilterValue {
  value: undefined | Value;
  fields: string[];
}

export type FilterMap = {
  field: string[];
  range: FilterValue[];
}[];

export interface RequestSearch {
  name: string;
  store: string;
  filter: FilterMap[];
  sort: { direction: 'ASC' | 'DESC'; field: string[] }[];
  slices: Slice[];
  fields: string[][];
  searches: RequestSearch[];
}
