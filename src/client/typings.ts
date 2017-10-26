export { default as ClientState } from './ClientState';

import {
  Data,
  Field,
  ForeignRelationField,
  FullArgs,
  Obj,
  Query,
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
  root: { type?: string; field: string; alias?: string };
  field: ForeignRelationField | RelationField;
  args: FullArgs;
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
  schema: Obj<Obj<Field>>;
  newId(type: string): string;
  auth(authState?: AuthState): string | null;

  query(query: Query | Query[]): Promise<Obj>;
  query(
    query: Query | Query[],
    onLoad: (data: Obj | null) => void,
    onChange?: ((changes: Data) => void),
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
