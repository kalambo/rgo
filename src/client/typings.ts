export { default as ClientState } from './ClientState';

import { Data, Field, Obj, Query } from '../core';

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
  auth(authState?: AuthState): string | null;

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
