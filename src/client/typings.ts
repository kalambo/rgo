export { default as ClientState } from './clientState';

import { Data, Field, Obj, Query, QueryRequest, QueryResponse } from '../core';

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface FullChanges {
  changes: DataChanges;
  changedData: Data;
}

export interface FetchInfo {
  slice: { start: number; end?: number };
  ids: string[];
}

export type FetchPlugin = (
  body: QueryRequest[],
  headers: Obj,
  next: (body: QueryRequest[], headers: Obj) => Promise<QueryResponse[]>,
) => Promise<QueryResponse[]>;

export type ChangePlugin = (
  state: { server: Data; client: Data; combined: Data; diff: DataDiff },
  changes: DataChanges,
) => void;

export type FilterPlugin = (filter?: any[]) => any[];

export interface ClientPlugin {
  onFetch?: FetchPlugin;
  onChange?: ChangePlugin;
  onFilter?: FilterPlugin;
}

export interface Client {
  schema: Obj<Obj<Field>>;
  newId(type: string): string;
  reset(): void;

  query(): Promise<void>;
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
