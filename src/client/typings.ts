import { Obj } from 'mishmash';

import { Data, Field } from '../core';

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export interface ClientState {
  server: Data;
  client: Data;
  combined: Data;
  diff: DataDiff;
}

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface Changes {
  changes: DataChanges;
  rootChanges: {
    added: string[];
    removed: string[];
  };
}

export interface ReadContext {
  state: ClientState;
  schema: Obj<Obj<Field>>;
  userId: string | null;
  variables: Obj;
  extra: Obj<{ slice: { skip: number; show: number }; ids: string[] }>;
}

export interface Client {
  get(): Data;
  get(type: string): Obj<Obj>;
  get(type: string, id: string): Obj;
  get(type: string, id: string, field: string): any;
  get(listener: (value: Data) => void): () => void;
  get(type: string, listener: (value: Obj<Obj>) => void): () => void;
  get(type: string, id: string, listener: (value: Obj) => void): () => void;
  get(
    type: string,
    id: string,
    field: string,
    listener: (value: any) => void,
  ): () => void;

  set(value: Obj<Obj<Obj | null | undefined> | undefined>): void;
  set(type: string, value: Obj<Obj | null | undefined> | undefined): void;
  set(type: string, id: string, value: Obj | null | undefined): void;
  set(type: string, id: string, field: string, value: any): void;

  query(queryString: string, variables: Obj, idsOnly: boolean): Promise<Obj>;
  query(
    queryString: string,
    variables: Obj,
    idsOnly: boolean,
    listener: (value: Obj | symbol) => void,
  ): () => void;
}
