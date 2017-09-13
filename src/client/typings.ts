export { default as ClientState } from './clientState';

import {
  Data,
  ForeignRelationField,
  Obj,
  QueryArgs,
  RelationField,
  Rules,
  ScalarName,
} from '../core';

import ClientState from './clientState';

export type AuthFetch = (url: string, body: any) => Promise<any>;

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface FullChanges {
  changes: DataChanges;
  changedData: Data;
  indices?: number[];
}

export interface QueryLayer {
  root: { type?: string; field: string };
  field: ForeignRelationField | RelationField;
  args: QueryArgs;
  structuralFields: string[];
  scalarFields: Obj<true>;
  relations: QueryLayer[];
  path: string;
  getArgsState: (
    state: ClientState,
  ) => {
    extra: { start: number; end: number };
    ids: string[];
  };
}

export interface FieldConfig {
  key: string;
  rules?: Rules;
  required?: boolean;
  showIf?: Obj;
  default?: any;
}
export interface FieldState {
  scalar: ScalarName;
  isList: boolean;
  rules: Rules;
  value: any;
  onChange: (value: any) => void;
  invalid: boolean;
}
export interface FieldsState {
  invalid: boolean;
  active: boolean[];
  mutate: () => Promise<Data | void>;
}

export interface QueryOptions {
  variables?: Obj;
  idsOnly?: boolean;
}

export interface Client {
  types: Obj<Obj<string>>;

  newId: (type: string) => string;

  field(field: FieldConfig): Promise<FieldState>;
  field(
    field: FieldConfig,
    listener: (value: FieldState | null) => void,
  ): () => void;

  fields(fields: FieldConfig[]): Promise<FieldsState>;
  fields(
    fields: FieldConfig[],
    listener: (value: FieldsState | null) => void,
  ): () => void;

  query(queryString: string, options?: QueryOptions): Promise<Obj>;
  query(
    queryString: string,
    options: QueryOptions & { info: true },
  ): Promise<{ data: Obj; spans: Obj }>;
  query(
    queryString: string,
    onLoad: (data: Obj | null) => void,
    onChange: ((changes: Data) => void) | true,
  ): () => void;
  query(
    queryString: string,
    options: QueryOptions,
    onLoad: (data: Obj | null) => void,
    onChange: ((changes: Data) => void) | true,
  ): () => void;
  query(
    queryString: string,
    options: QueryOptions & { info: true },
    onLoad: (value: { data: Obj; spans: Obj } | null) => void,
    onChange: ((changes: Data) => void) | true,
  ): () => void;

  set(value: Obj<Obj<Obj | null | undefined> | undefined>): void;
  set(type: string, value: Obj<Obj | null | undefined> | undefined): void;
  set(type: string, id: string, value: Obj | null | undefined): void;
  set(type: string, id: string, field: string, value: any): void;

  mutate(keys: string[], clearKeys?: string[]): Promise<Data>;
}
