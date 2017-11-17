import {
  Field,
  fieldIs,
  ForeignRelationField,
  ResolveQuery,
  Obj,
  QueryLayer,
  RelationField,
} from './typings';

const sortedStringify = (obj: Obj) =>
  Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
    .map(k => `${k}:${Array.isArray(obj[k]) ? JSON.stringify(obj[k]) : obj[k]}`)
    .join(',');

const walkQueryLayer = <T, U>(
  layer: QueryLayer,
  relations: ResolveQuery[],
  schema: Obj<Obj<Field>>,
  context: U,
  func: (
    layer: QueryLayer,
    relations: {
      name: string;
      alias?: string;
      foreign: boolean;
      walk: () => T;
    }[],
    context: U,
  ) => T,
): T =>
  func(
    layer,
    relations.map(({ name, alias, fields, extra, trace, key, ...args }) => {
      const field = schema[layer.field.type][name] as
        | ForeignRelationField
        | RelationField;
      return {
        name,
        alias,
        foreign: fieldIs.foreignRelation(field),
        walk: () =>
          walkQueryLayer(
            {
              root: { type: layer.field.type, field: name, alias },
              field,
              args,
              fields: fields.filter(f => typeof f === 'string') as string[],
              extra,
              trace,
              path: [...layer.path, layer.key],
              key: key || `${name}~${sortedStringify(args)}`,
            },
            fields.filter(f => typeof f !== 'string') as ResolveQuery[],
            schema,
            context,
            func,
          ),
      };
    }),
    context,
  );

export default function walker<T, U>(
  func: (
    layer: QueryLayer,
    relations: {
      name: string;
      alias?: string;
      foreign: boolean;
      walk: () => T;
    }[],
    context: U,
  ) => T,
) {
  return (queries: ResolveQuery[], schema: Obj<Obj<Field>>, context: U) =>
    queries.map(({ name, alias, fields, extra, trace, key, ...args }) =>
      walkQueryLayer(
        {
          root: { field: name, alias },
          field: { type: name, isList: true },
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          extra,
          trace,
          path: [],
          key: key || `${name}~${sortedStringify(args)}`,
        },
        fields.filter(f => typeof f !== 'string') as ResolveQuery[],
        schema,
        context,
        func,
      ),
    );
}
