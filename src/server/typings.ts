import { Obj, QueryArgs, ScalarName } from '../core';

export interface DbField {
  scalar: ScalarName;
  isList?: boolean;
}

export interface Connector {
  newId: () => string;

  query: (args: QueryArgs) => Promise<any[]>;

  findById: (id: string) => Promise<any>;
  findByIds: (ids: string[]) => Promise<any[]>;

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

export interface AuthConfig {
  type: string;
  usernameField: string;
  authIdField: string;
  create(username: string, password: string, id: string): Promise<string>;
  getId(authToken: string): Promise<string | null>;
}

// export interface TypeAuth {
//   query?: (
//     userId: string | null,
//     args: QueryArgs,
//   ) => QueryArgs | Promise<QueryArgs>;
//   insert?: (
//     userId: string | null,
//     id: string,
//     data: Obj | null,
//   ) => boolean | Promise<boolean>;
//   update?: (
//     userId: string | null,
//     id: string,
//     data: Obj | null,
//     prev: Obj | null,
//   ) => boolean | Promise<boolean>;
//   delete?: (
//     userId: string | null,
//     id: string,
//     prev: Obj | null,
//   ) => boolean | Promise<boolean>;
// }

export interface FieldDbMap {
  toDb: (value: any) => any;
  fromDb: (value: any) => any;
}
