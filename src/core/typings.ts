export type Obj<T = any> = { [key: string]: T };

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

export interface IdRecord {
  id: string;
  [field: string]: RecordValue | null;
}

export interface Args<T = undefined> {
  filter?: T | any[];
  sort?: T | string[];
  start?: number;
  end?: number;
}

export interface Query<T = undefined> extends Args<T> {
  name: string;
  alias?: string;
  fields: (string | Query<T>)[];
}

export interface FullQuery extends Args<undefined> {
  name: string;
  alias?: string;
  fields: (string | FullQuery)[];
  offset?: number;
  trace?: { start: number; end?: number };
}

export interface QueryLayer {
  root: { type?: string; field: string; alias?: string };
  field: ForeignRelationField | RelationField;
  args: Args;
  fields: string[];
  offset: number;
  trace?: { start: number; end?: number };
  relations: string[];
  path: string[];
  key: string;
}

export interface ScalarField {
  scalar: 'boolean' | 'int' | 'float' | 'string' | 'date' | 'json';
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

export interface Source {
  newId(): string;
  query(args: Args, fields: string[]): Promise<IdRecord[]>;
  findById(id: string): Promise<IdRecord | null>;
  insert(id: string, data: any): Promise<void>;
  update(id: string, data: any): Promise<void>;
  delete(id: string): Promise<void>;
  dump(): Promise<IdRecord[]>;
  restore(data: IdRecord[]): Promise<void>;
}

export type DataChanges = Obj<Obj<Obj<true>>>;

export interface RgoRequest {
  queries: FullQuery[];
  commits: Obj<Obj<Record | null>>[];
}

export interface RgoResponse {
  data: Obj<Obj<Record>>;
  firstIds: Obj<Obj<string>>;
  commits: (string | Obj<Obj<string>>)[];
}
