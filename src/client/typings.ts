import {
  Args,
  Data,
  Field,
  FieldValue,
  ForeignRelationField,
  Obj,
  Query,
  QueryRequest,
  QueryResponse,
  RelationField,
} from '../core';

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export interface ClientState {
  server: Obj<Obj<Obj<FieldValue | null>>>;
  client: Obj<Obj<Obj<FieldValue | null> | null>>;
  combined: Obj<Obj<Obj<FieldValue>>>;
  diff: DataDiff;
}

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface FullChanges {
  changes: DataChanges;
  changedData: Data;
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
    firstIds: Obj<string>;
  };
  active: Obj<{
    path: string;
    changing: string[];
  }>;
  pending?: {
    alias: string;
    changing: string[];
    data: FetchData;
  };
}

export type FetchPlugin = (
  body: QueryRequest[],
  headers: Obj,
  next: (body: QueryRequest[], headers: Obj) => Promise<QueryResponse[]>,
) => Promise<QueryResponse[]>;

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
  query(query: Query<string> | Query<string>[]): Promise<Obj>;
  query(
    query: Query<string> | Query<string>[],
    onLoad: (data: Obj | null) => void,
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
