export { default as ClientState } from './ClientState';

import {
  Args,
  Data,
  Field,
  ForeignRelationField,
  Obj,
  RelationField,
} from '../core';

import ClientState from './ClientState';

export interface AuthState {
  id: string;
  token: string;
  refresh?: string;
}

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
  args: Args;
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

export interface Client {
  schema(): Obj<Obj<Field>>;
  newId(type: string): string;
  auth(authState?: AuthState): string | null;

  get(keys: [string, string, string][]): Promise<any[]>;
  get(
    keys: [string, string, string][],
    listener: (values: any[] | null) => void,
  ): () => void;

  query(query: string): Promise<Obj>;
  query(query: string, info: true): Promise<{ data: Obj; spans: Obj }>;
  query(
    query: string,
    onLoad: (data: Obj | null) => void,
    onChange: ((changes: Data) => void) | true,
  ): () => void;
  query(
    query: string,
    info: true,
    onLoad: (value: { data: Obj; spans: Obj } | null) => void,
    onChange: ((changes: Data) => void) | true,
  ): () => void;

  set(
    values: (
      | { key: [string, string, string]; value: any }
      | { key: [string, string]; value?: null })[],
  ): void;

  commit(
    keys: [string, string, string][],
  ): Promise<{ values: any[]; newIds: Obj } | null>;
}
