export { default as ClientState } from './ClientState';

import { Data, Field, Obj, Query, QueryRequest, QueryResponse } from '../core';

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface FullChanges {
  changes: DataChanges;
  changedData: Data;
}

export interface QueryInfo {
  watcher: () => void;
  fetched: Obj<{
    slice: { start: number; end?: number };
    ids: string[];
  }>;
  firstIds: Obj<Obj<string>>;
  hasFetched: boolean;
  pending?: {
    requests: string[];
    next: Obj<{
      slice: { start: number; end?: number };
      ids: string[];
    }>;
  };
}

export interface Client {
  schema: Obj<Obj<Field>>;
  newId(type: string): string;

  query(query: Query<string> | Query<string>[]): Promise<Obj>;
  query(
    query: Query<string> | Query<string>[],
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

export type FetchPlugin = (
  body: QueryRequest[],
  headers: Obj,
  next: (body: QueryRequest[], headers: Obj) => Promise<QueryResponse[]>,
  reset: () => void,
) => Promise<QueryResponse[]>;

export type ChangePlugin = (
  state: { server: Data; client: Data; combined: Data; diff: DataDiff },
  changes: DataChanges,
) => void;

export type FilterPlugin = (filter?: any[]) => any[];

export interface Plugin {
  onFetch?: FetchPlugin;
  onChange?: ChangePlugin;
  onFilter?: FilterPlugin;
}
