import { Field, Obj, Query, RgoRequest } from '../core';

export interface Mutation {
  id: string;
  record: Obj | null;
  prev: Obj | null;
}

export interface Info {
  schema: Obj<Obj<Field>>;
  runQuery: (...queries: Query<string>[]) => Promise<Obj>;
  context: Obj;
}

export type RequestPlugin = ((
  request: { request: RgoRequest; headers: Obj },
  info: Info,
) => Obj | void | Promise<Obj | void>);

export type CommitPlugin = ((
  mutation: { type: string } & Mutation,
  info: Info,
) => Obj | void | Promise<Obj | void>);

export interface ServerPlugin {
  onRequest?: RequestPlugin;
  onCommit?: CommitPlugin;
}
