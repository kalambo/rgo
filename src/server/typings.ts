import { Obj } from 'mishmash';

import { Field, QueryArgs } from '../core';

export interface Connector {

  query: (args: QueryArgs) => Promise<any[]>;

  findById: (id: string) => Promise<any>;

  insert: (id: string, data: any) => Promise<void>;
  update: (id: string, data: any) => Promise<void>;
  delete: (id: string) => Promise<void>;

  dump: () => Promise<any[]>;
  restore: (data: any[]) => Promise<void>;

}

export interface TypeAuth {
  query?: (userId: string | null, args: QueryArgs) => QueryArgs | Promise<QueryArgs>;
  insert?: (userId: string | null, id: string, data: any) => boolean | Promise<boolean>;
  update?: (
    userId: string | null, id: string, data: any, prev: any,
  ) => boolean | Promise<boolean>;
  delete?: (userId: string | null, id: string, prev: any) => boolean | Promise<boolean>;
}

export interface DataType {
  fields: Obj<Field>;
  connector: Connector;
  newId: () => string;
  auth: TypeAuth;
}

export interface FieldDbMap {
  toDb: (value: any) => any;
  fromDb: (value: any) => any;
};
