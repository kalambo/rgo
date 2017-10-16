import { Args, Field, Obj, ScalarName } from '../core';

export interface DbField {
  scalar: ScalarName;
  isList?: boolean;
}

export interface Connector {
  newId: () => string;

  query: (args: Args) => Promise<any[]>;

  findById: (id: string) => Promise<any>;

  insert: (id: string, data: any) => Promise<void>;
  update: (id: string, data: any) => Promise<void>;
  delete: (id: string) => Promise<void>;

  dump: () => Promise<any[]>;
  restore: (data: any[]) => Promise<void>;
}

export interface Mutation {
  id: string;
  data: Obj | null;
  prev: Obj | null;
}

export type QueryLimit = false | null | { filter?: any; fields?: string[] };

export interface AuthConfig {
  type: string;
  usernameField: string;
  authIdField: string;
  metaFields?: string[];
  createAuth(
    username: string,
    password: string,
    userId: string,
    metadata?: Obj,
  ): Promise<string>;
  getUserId(authToken: string): Promise<string | null>;
  limitQuery: (
    schema: Obj<Obj<Field>>,
    runQuery: (query: string) => Promise<Obj>,
    user: Obj | null,
    type: string,
  ) => QueryLimit | Promise<QueryLimit>;
  allowMutation: (
    schema: Obj<Obj<Field>>,
    runQuery: (query: string) => Promise<Obj>,
    user: Obj | null,
    type: string,
    id: string,
    data: Obj | null,
    prev: Obj | null,
  ) => boolean | Promise<boolean>;
  allowAlter: (user: Obj | null) => boolean | Promise<boolean>;
}

export interface FieldDbMap {
  toDb: (value: any) => any;
  fromDb: (value: any) => any;
}
