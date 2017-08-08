import {
  Data,
  ForeignRelationField,
  Obj,
  QueryArgs,
  QueryRequest,
  QueryResponse,
  RelationField,
  Rules,
  ScalarName,
} from '../core';

export type AuthFetch = (
  url: string,
  body: QueryRequest[],
) => Promise<QueryResponse[]>;

export type DataDiff = Obj<Obj<1 | -1 | 0>>;

export interface ClientState {
  server: Data;
  client: Data;
  combined: Data;
  diff: DataDiff;
}

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface QueryLayer {
  root: { type?: string; field: string };
  field: ForeignRelationField | RelationField;
  args: QueryArgs & {
    unsorted: boolean;
    filterFields: string[];
    structuralFields: string[];
  };
  scalarFields: Obj<true>;
  relations: QueryLayer[];
  path: string;
}

export interface FieldConfig {
  key: string;
  rules?: Rules;
  optional?: true;
  showIf?: Obj;
}
export interface FieldState {
  scalar: ScalarName;
  isList?: true;
  value: any;
  onChange: (value: any) => void;
  invalid: boolean;
}

export interface QueryOptions {
  variables?: Obj;
  idsOnly?: boolean;
}

export interface Client {
  field(field: FieldConfig): FieldState;
  field(fields: FieldConfig[]): { invalid: boolean; active: boolean[] };
  field(field: FieldConfig, listener: (value: FieldState) => void): () => void;
  field(
    fields: FieldConfig[],
    listener: (value: { invalid: boolean; active: boolean[] }) => void,
  ): () => void;

  query(queryString: string, options?: QueryOptions): Promise<Obj>;
  query(
    queryString: string,
    options: QueryOptions & { info: true },
  ): Promise<{ data: Obj; cols: Obj }>;
  query(queryString: string, listener: (value: Obj | null) => void): () => void;
  query(
    queryString: string,
    options: QueryOptions,
    listener: (data: Obj | null) => void,
  ): () => void;
  query(
    queryString: string,
    options: QueryOptions & { info: true },
    listener: (value: { data: Obj; cols: Obj } | null) => void,
  ): () => void;

  set(value: Obj<Obj<Obj | null | undefined> | undefined>): void;
  set(type: string, value: Obj<Obj | null | undefined> | undefined): void;
  set(type: string, id: string, value: Obj | null | undefined): void;
  set(type: string, id: string, field: string, value: any): void;
}
