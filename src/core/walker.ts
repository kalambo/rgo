import {
  Field,
  fieldIs,
  ForeignRelationField,
  Obj,
  Query,
  QueryLayer,
  RelationField,
} from './typings';
import { queryKey } from './utils';

const walkQueryLayer = <T, U>(
  layer: QueryLayer,
  relations: Query[],
  schema: Obj<Obj<Field>>,
  context: U,
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
): T =>
  func(layer, context, () =>
    relations.map(({ name, fields, ...args }) => {
      const field = schema[layer.field.type][name] as
        | ForeignRelationField
        | RelationField;
      return walkQueryLayer(
        {
          root: { type: layer.field.type, field: name },
          field,
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          relations: fields
            .filter(
              f =>
                typeof f !== 'string' &&
                fieldIs.relation(schema[field.type][f.name]),
            )
            .map(f => (f as Query).name) as string[],
          path: [...layer.path, layer.key],
          key: `${queryKey(name, args)}`,
        },
        fields.filter(f => typeof f !== 'string') as Query[],
        schema,
        context,
        func,
      );
    }),
  );

export default function walker<T, U>(
  func: (layer: QueryLayer, context: U, walkRelations: () => T[]) => T,
) {
  return (queries: Query[], schema: Obj<Obj<Field>>, context: U) =>
    queries.map(({ name, fields, ...args }) =>
      walkQueryLayer(
        {
          root: { field: name },
          field: { type: name, isList: true },
          args,
          fields: fields.filter(f => typeof f === 'string') as string[],
          relations: fields
            .filter(
              f =>
                typeof f !== 'string' && fieldIs.relation(schema[name][f.name]),
            )
            .map(f => (f as Query).name) as string[],
          path: [],
          key: `${queryKey(name, args)}`,
        },
        fields.filter(f => typeof f !== 'string') as Query[],
        schema,
        context,
        func,
      ),
    );
}
