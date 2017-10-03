export { default as ClientState } from './clientState';

import {
  Data,
  Field,
  ForeignRelationField,
  Obj,
  QueryArgs,
  QueryRequest,
  QueryResponse,
  RelationField,
} from '../core';

import ClientState from './clientState';

export type AuthFetch = (body: QueryRequest[]) => Promise<QueryResponse[]>;

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

export interface QueryOptions {
  variables?: Obj;
  idsOnly?: boolean;
}

export interface Client {
  ready(): Promise<void>;
  schema(): Obj<Obj<Field>>;
  newId(type: string): string;

  login(username: string, password: string): Promise<string | null>;
  login(authState: AuthState): void;
  logout(): Promise<void>;
  loggedIn(listener: (value: boolean) => void): () => void;

  get(keys: [string, string, string][]): Promise<Obj<Obj>>;
  get(
    keys: [string, string, string][],
    listener: (values: Obj<Obj> | null) => void,
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

  mutate(keys: string[], clearKeys?: string[]): Promise<Data | null>;
}
