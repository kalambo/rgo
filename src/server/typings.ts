import { Field, FullArgs, Obj, Query, QueryRequest } from '../core';

export interface Methods {}

export interface Connector {
  newId(): string;
  query(args: FullArgs): Promise<any[]>;
  findById(id: string): Promise<any>;
  insert(id: string, data: any): Promise<void>;
  update(id: string, data: any): Promise<void>;
  delete(id: string): Promise<void>;
  dump(): Promise<any[]>;
  restore(data: any[]): Promise<void>;
}

export interface Mutation {
  id: string;
  data: Obj | null;
  prev: Obj | null;
}

export interface Info {
  schema: Obj<Obj<Field>>;
  runQuery: (query: Query<string> | Query<string>[]) => Promise<Obj>;
  context: Obj;
}

export type RequestPlugin = ((
  request: { request: QueryRequest | QueryRequest[]; headers: Obj },
  info: Info,
) => Obj | void | Promise<Obj | void>);

export type FilterPlugin = (filter: any[] | undefined, info: Info) => any[];

export type QueryLimit = { filter?: any[]; fields?: string[] };
export type QueryPlugin = ((
  type: string,
  info: Info,
) => QueryLimit[] | void | Promise<QueryLimit[] | void>);

export type CommitPlugin = ((
  mutation: { type: string } & Mutation,
  info: Info,
) => Obj | void | Promise<Obj | void>);

export interface ServerPlugin {
  onRequest?: RequestPlugin;
  onFilter?: FilterPlugin;
  onQuery?: QueryPlugin;
  onCommit?: CommitPlugin;
}
