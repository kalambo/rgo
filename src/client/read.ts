import { keysToObject, Obj } from 'mishmash';
import {
  ArgumentNode,
  DocumentNode,
  FieldNode,
  IntValueNode,
  OperationDefinitionNode,
  StringValueNode,
} from 'graphql';

import {
  Field,
  fieldIs,
  ForeignRelationField,
  noUndef,
  parseArgs,
  RelationField,
  QueryArgs,
} from '../core';

export type Data = Obj<Obj<Obj>>;

export interface ReadContext {
  schema: Obj<Obj<Field>>;
  userId: string | null;
  variables: Obj;
}

const toArray = x => (Array.isArray(x) ? x : [x]);

const compareValues = (a, b) => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (typeof a === 'string') return a.localeCompare(b) as 0 | 1 | -1;
  if (a < b) return -1;
  return 1;
};

const runFilter = (filter: any, record: any) => {
  const key = Object.keys(filter)[0];

  if (key === '$and')
    return (filter[key] as any[]).every(b => runFilter(b, record));
  if (key === '$or')
    return (filter[key] as any[]).some(b => runFilter(b, record));

  const op = Object.keys(filter[key])[0];
  if (op === '$eq') return record[key] === filter[key][op];
  if (op === '$ne') return record[key] !== filter[key][op];
  if (op === '$lt') return record[key] < filter[key][op];
  if (op === '$lte') return record[key] <= filter[key][op];
  if (op === '$gt') return record[key] > filter[key][op];
  if (op === '$gte') return record[key] >= filter[key][op];
  if (op === '$in') return filter[key][op].includes(record[key]);

  return false;
};

class Resolver {
  private field: { type: string; isList?: true; foreign?: string };
  private args: QueryArgs;

  private data: Data;
  private baseIds: string[];

  private fieldNames: string[];
  private resolvers: Obj<Resolver>;

  constructor(
    field: ForeignRelationField | RelationField,
    args: ArgumentNode[] = [],
    selections: FieldNode[],
    context: ReadContext,
    initialData: Data,
  ) {
    this.field = {
      type: field.type,
      isList: fieldIs.foreignRelation(field) || field.isList,
      foreign: fieldIs.foreignRelation(field)
        ? field.foreign
        : Object.keys(context.schema[field.type]).find(f => {
            const foreignField = context.schema[field.type][f];
            return (
              fieldIs.foreignRelation(foreignField) &&
              foreignField.type === field.type &&
              foreignField.foreign === f
            );
          }),
    };

    this.args = parseArgs(
      keysToObject(
        args,
        ({ value }) => {
          if (value.kind === 'Variable')
            return context.variables[value.name.value];
          return (value as IntValueNode | StringValueNode).value;
        },
        ({ name }) => name.value,
      ),
      context.userId,
      context.schema[field.type],
    );

    this.data = initialData;
    this.baseIds = Object.keys(initialData[field.type])
      .filter(this.baseFilter)
      .sort(this.compare);

    this.fieldNames = selections.map(({ name }) => name.value);
    this.resolvers = keysToObject(
      selections.filter(({ selectionSet }) => selectionSet),
      node => {
        return new Resolver(
          context.schema[field.type][node.name.value] as
            | ForeignRelationField
            | RelationField,
          node.arguments,
          node.selectionSet!.selections as FieldNode[],
          context,
          initialData,
        );
      },
      ({ name: { value: fieldName } }) => fieldName,
    );
  }

  private compare(id1: string, id2: string) {
    for (const k of Object.keys(this.args.sort)) {
      const comp = compareValues(
        noUndef(this.data[this.field.type][id1][k]),
        noUndef(this.data[this.field.type][id2][k]),
      );
      if (comp) return this.args.sort[k] === 1 ? comp : -1;
    }
    return 0;
  }

  private baseFilter(id: string) {
    return runFilter(this.args.filter, this.data[this.field.type][id]);
  }

  private rootFilter(root: { id?: string; value?: any }) {
    const arrayValue = toArray(noUndef(root.value));
    return id => {
      const record = this.data[this.field.type][id];
      return (
        arrayValue.includes(record.id) ||
        (this.field.foreign && record[this.field.foreign] === root.id) ||
        false
      );
    };
  }

  private resolveRecord(id: string | null = null, changes: Data) {
    if (id === null) return null;
    const record = this.data[this.field.type][id];
    return keysToObject(this.fieldNames, fieldName => {
      const value = noUndef(record[fieldName]);
      if (!this.resolvers[fieldName]) return value;
      return this.resolvers[fieldName].run(
        { id: record[fieldName].id, value },
        this.data,
        changes,
      );
    });
  }

  public run(root: { id?: string; value?: any }, data: Data, changes: Data) {
    this.data = data;
    if (!root.value && !this.field.foreign) {
      return this.baseIds.map(id => this.resolveRecord(id, changes));
    }
    return this.field.isList
      ? this.baseIds
          .filter(this.rootFilter(root))
          .slice(
            this.args.skip,
            this.args.show === null
              ? undefined
              : this.args.skip + this.args.show,
          )
          .map(id => this.resolveRecord(id, changes))
      : this.resolveRecord(this.baseIds.find(this.rootFilter(root)), changes);
  }
}

export default function read(
  queryDoc: DocumentNode,
  context: ReadContext,
  initialData: Obj<Obj<Obj>>,
  listener?: (value) => any,
) {
  const fieldNodes = (queryDoc.definitions[0] as OperationDefinitionNode)
    .selectionSet.selections as FieldNode[];
  const types = fieldNodes.map(({ name }) => name.value);
  const resolvers = keysToObject(
    fieldNodes,
    node =>
      new Resolver(
        { type: node.name.value, isList: true },
        node.arguments,
        node.selectionSet!.selections as FieldNode[],
        context,
        initialData,
      ),
    ({ name: { value: type } }) => type,
  );

  const result = keysToObject(types, type =>
    resolvers[type].run({}, initialData, {}),
  );
  if (!listener) return result;
  listener(result);
}
