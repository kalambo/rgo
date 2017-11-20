export type Obj<T = any> = { [key: string]: T };

export type Falsy = false | null | undefined | void;

export type Scalar = 'boolean' | 'int' | 'float' | 'string' | 'date' | 'json';

export interface ScalarField {
  scalar: Scalar;
  isList?: true;
  meta?: any;
}
export interface RelationField {
  type: string;
  isList?: true;
  meta?: any;
}
export interface ForeignRelationField {
  type: string;
  foreign: string;
  meta?: any;
}
export type Field = ScalarField | RelationField | ForeignRelationField;

export type Schema = Obj<Obj<Field>>;

export const fieldIs = {
  scalar: (field: Field): field is ScalarField => {
    return !!(field as ScalarField).scalar;
  },
  relation: (field: Field): field is RelationField => {
    return (
      !!(field as RelationField).type &&
      !(field as ForeignRelationField).foreign
    );
  },
  foreignRelation: (field: Field): field is ForeignRelationField => {
    return (
      !!(field as RelationField).type &&
      !!(field as ForeignRelationField).foreign
    );
  },
};

export type RecordValue =
  | boolean
  | number
  | string
  | Date
  | Obj
  | boolean[]
  | number[]
  | string[]
  | Date[]
  | Obj[];

export type Record = Obj<RecordValue | null>;

export type Data<T = Record | null> = Obj<Obj<T>>;

export type ClientData = Data<
  Obj<RecordValue | null | undefined> | null | undefined
>;

export type FilterOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'in';

export interface Args<T = undefined> {
  filter?: T | any[];
  sort?: T | string[];
  start?: number;
  end?: number;
}

export interface Query extends Args<string> {
  name: string;
  alias?: string;
  fields: (string | Query)[];
}

export interface ResolveQuery extends Args<undefined> {
  name: string;
  alias?: string;
  fields: (string | ResolveQuery)[];
  extra?: { start: number; end: number };
  trace?: { start: number; end?: number };
  key?: string;
}

export interface QueryLayer {
  root: { type?: string; field: string; alias?: string };
  field: ForeignRelationField | RelationField;
  args: Args;
  fields: string[];
  extra?: { start: number; end: number };
  trace?: { start: number; end?: number };
  path: string[];
  key: string;
}

export type GetStart = (
  layer: QueryLayer,
  rootId: string,
  recordIds: (string | null)[],
) => number;

export type DataChanges = Data<Obj<true>>;

export interface State {
  server: Data<Record>;
  client: Data;
  combined: Data<Obj<RecordValue>>;
  diff: Data<1 | -1 | 0>;
}

export interface FetchInfo {
  name: string;
  field: ForeignRelationField | RelationField;
  args: Args;
  fields: Obj<number>;
  relations: Obj<FetchInfo>;
  complete: {
    data: {
      fields: string[];
      slice: { start: number; end?: number };
      ids: string[];
    };
    firstIds: Obj<string | null>;
  };
  active: Obj<string[]>;
  pending?: {
    changing: string[];
    data: {
      fields: string[];
      slice: { start: number; end?: number };
      ids: string[];
    };
  };
}

export interface ResolveRequest {
  commits?: Data[];
  queries?: ResolveQuery[];
  context?: Obj;
}

export interface ResolveResponse {
  newIds: (Data<string> | string)[];
  data: Data<Record>;
  firstIds: Data<string | null>;
}

export type Resolver = (() => Promise<Schema>) &
  ((request: ResolveRequest) => Promise<ResolveResponse>);

export type Enhancer = (resolver: Resolver) => Resolver;

export interface Rgo {
  schema: Schema;
  flush(): void;

  create(type: string): string;

  query(): Promise<void>;
  query(...queries: Query[]): Promise<Obj>;
  query(query: Query, onLoad: (data: Obj | null) => void): () => void;
  query(
    query1: Query,
    query2: Query,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query,
    query2: Query,
    query3: Query,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query,
    query2: Query,
    query3: Query,
    query4: Query,
    onLoad: (data: Obj | null) => void,
  ): () => void;
  query(
    query1: Query,
    query2: Query,
    query3: Query,
    query4: Query,
    query5: Query,
    onLoad: (data: Obj | null) => void,
  ): () => void;

  set(
    ...values: (
      | { key: [string, string, string]; value: RecordValue | null | undefined }
      | { key: [string, string]; value: null | undefined })[]
  ): void;

  commit(
    ...keys: ([string, string] | [string, string, string])[]
  ): Promise<Data<string>>;
}
