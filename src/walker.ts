import {
  Field,
  fieldIs,
  ForeignRelationField,
  FullQuery,
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
  relations: FullQuery[],
  schema: Obj<Obj<Field>>,
  context: U,
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
): T =>
  func(layer, context, () =>
    relations.map(({ name, alias, fields, offset, trace, ...args }) => {
      const field = schema[layer.field.type][name] as
        | ForeignRelationField
        | RelationField;
      return walkQueryLayer(
        {
          root: { type: layer.field.type, field: name, alias },
          field,
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          offset: offset || 0,
          trace,
          relations: fields
            .filter(
              f =>
                typeof f !== 'string' &&
                fieldIs.relation(schema[field.type][f.name]),
            )
            .map(f => (f as FullQuery).name) as string[],
          path: [...layer.path, layer.key],
          key: `${name}~${sortedStringify(args)}`,
        },
        fields.filter(f => typeof f !== 'string') as FullQuery[],
        schema,
        context,
        func,
      );
    }),
  );

export default function walker<T, U>(
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
) {
  return (queries: FullQuery[], schema: Obj<Obj<Field>>, context: U) =>
    queries.map(({ name, alias, fields, offset, trace, ...args }) =>
      walkQueryLayer(
        {
          root: { field: name, alias },
          field: { type: name, isList: true },
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          offset: offset || 0,
          trace,
          relations: fields
            .filter(
              f =>
                typeof f !== 'string' && fieldIs.relation(schema[name][f.name]),
            )
            .map(f => (f as FullQuery).name) as string[],
          path: [],
          key: `${name}~${sortedStringify(args)}`,
        },
        fields.filter(f => typeof f !== 'string') as FullQuery[],
        schema,
        context,
        func,
      ),
    );
}
