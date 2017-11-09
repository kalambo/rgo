import {
  Args,
  DataChanges,
  Field,
  ForeignRelationField,
  Obj,
  Query,
  Record,
  RecordValue,
  RelationField,
  RgoRequest,
  RgoResponse,
} from '../core';

export interface ClientState {
  server: Obj<Obj<Record>>;
  client: Obj<Obj<Record | null>>;
  combined: Obj<Obj<Obj<RecordValue>>>;
  diff: Obj<Obj<1 | -1 | 0>>;
}

export type FetchData = {
  fields: string[];
  slice: { start: number; end?: number };
  ids: string[];
};

export interface FetchInfo {
  name: string;
  field: ForeignRelationField | RelationField;
  args: Args;
  fields: Obj<number>;
  relations: Obj<FetchInfo>;
  complete: {
    data: FetchData;
    offset: number;
    firstIds: Obj<string>;
  };
  active: Obj<string[]>;
  pending?: {
    changing: string[];
    offset: number;
    data: FetchData;
  };
}

export type FetchPlugin = (
  body: RgoRequest,
  headers: Obj,
  next: (body: RgoRequest, headers: Obj) => Promise<RgoResponse>,
) => Promise<RgoResponse>;

export type ChangePlugin = (state: ClientState, changes: DataChanges) => void;

export type FilterPlugin = (filter?: any[]) => any[];

export interface ClientPlugin {
  onFetch?: FetchPlugin;
  onChange?: ChangePlugin;
  onFilter?: FilterPlugin;
}

export interface Client {
  schema: Obj<Obj<Field>>;
  reset(): void;

  create(type: string): string;

  query(): Promise<void>;
  query(...queries: Query<string>[]): Promise<Obj>;
  query(query: Query<string>, onLoad: (data: Obj | null) => void): () => void;
  query(
    query1: Query<string>,
    query2: Query<string>,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query<string>,
    query2: Query<string>,
    query3: Query<string>,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query<string>,
    query2: Query<string>,
    query3: Query<string>,
    query4: Query<string>,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query<string>,
    query2: Query<string>,
    query3: Query<string>,
    query4: Query<string>,
    query5: Query<string>,
    onLoad: (data: Obj | null) => void,
  ): () => void;

  set(
    ...values: (
      | { key: [string, string, string]; value: any }
      | { key: [string, string]; value?: null })[]
  ): void;

  commit(
    ...keys: ([string, string] | [string, string, string])[]
  ): Promise<{ values: any[]; newIds: Obj } | null>;
}
