import { standardizeQueries, standardizeSchema } from './standardize';
import {
  Connector,
  Field,
  fieldIs,
  FullQuery,
  IdRecord,
  Obj,
  Record,
} from './typings';
import walker from './walker';
import { undefOr } from './utils';

const runner = walker<
  Promise<void>,
  {
    connector: Connector;
    data: Obj<Obj<Record>>;
    firstIds: Obj<Obj<string | null>>;
    records: Obj<IdRecord[]>;
  }
>(
  async (
    { root, field, args, fields, offset, relations, path, key },
    { connector, data, firstIds, records },
    walkRelations,
  ) => {
    const rootPath = path.join('_');
    const fieldPath = [...path, key].join('_');

    if (!root.type || fieldIs.foreignRelation(field)) {
      args.sort = args.sort || [];
    }
    const queryFields = Array.from(new Set(['id', ...fields, ...relations]));
    if (root.type) {
      const rootField = fieldIs.relation(field) ? root.field : 'id';
      const relField = fieldIs.relation(field) ? 'id' : field.foreign;
      const relFilter = [
        relField,
        'in',
        records[rootPath].reduce(
          (res, root) => res.concat((root[rootField] as string[]) || []),
          [] as string[],
        ),
      ];
      args.filter = args.filter ? ['AND', args.filter, relFilter] : relFilter;
      if (!queryFields.includes(relField)) queryFields.push(relField);
    }
    records[fieldPath] = await connector.query(
      field.type,
      {
        ...args,
        start: 0,
        end: undefOr(
          args.end,
          (args.start || 0) + args.end! * (records[rootPath] || [{}]).length,
        ),
      },
      queryFields,
    );

    data[field.type] = data[field.type] || {};
    records[fieldPath].forEach(({ id, ...record }) => {
      data[field.type][id] = data[field.type][id]
        ? { ...data[field.type][id], ...record }
        : record;
    });

    const first = (args.start || 0) + offset;
    if (!root.type) {
      firstIds[fieldPath] = firstIds[fieldPath] || {};
      firstIds[fieldPath][''] = records[fieldPath][first]
        ? records[fieldPath][first].id
        : null;
    } else if (fieldIs.foreignRelation(field) || (field.isList && args.sort)) {
      firstIds[fieldPath] = firstIds[fieldPath] || {};
      records[rootPath].forEach(rootRecord => {
        if (fieldIs.relation(field)) {
          const value = rootRecord[root.field] as (string | null)[] | null;
          if (!value) {
            firstIds[fieldPath][rootRecord.id] = null;
          } else if (args.sort) {
            const firstRecord = records[fieldPath].filter(r =>
              value.includes(r.id),
            )[first] as IdRecord | null | undefined;
            firstIds[fieldPath][rootRecord.id] = firstRecord
              ? firstRecord.id
              : null;
          } else {
            firstIds[fieldPath][rootRecord.id] = value[first] || null;
          }
        } else {
          const firstRecord = records[fieldPath].filter(r => {
            const value = r[field.foreign] as string[] | string | null;
            return Array.isArray(value)
              ? value.includes(rootRecord.id)
              : value === rootRecord.id;
          })[first] as IdRecord | undefined;
          firstIds[fieldPath][rootRecord.id] = firstRecord
            ? firstRecord.id
            : null;
        }
      });
    }

    await Promise.all(walkRelations());
  },
);

export default async function run(
  queries: FullQuery[],
  schema: Obj<Obj<Field>>,
  connector: Connector,
  data: Obj<Obj<Record>>,
) {
  const standardSchema = standardizeSchema(schema);
  const standardQueries = standardizeQueries(queries, standardSchema);

  const firstIds = {} as Obj<Obj<string | null>>;
  await Promise.all(
    runner(standardQueries, standardSchema, {
      connector,
      data,
      firstIds,
      records: {},
    }),
  );
  return firstIds;
}

// args.filter = mapFilter('decode', args.filter, info.schema[field.type]);

//   const firstIds: Obj<Obj<string>> = {};

//   const processLayer = (
//     root: { type?: string; field: string },
//     field: ForeignRelationField | RelationField,
//     { arguments: argNodes, selectionSet }: FieldNode,
//     queryResults: Obj<(Obj | null)[]>,
//     path: string,
//   ) => {
//     const fieldNodes = selectionSet!.selections as FieldNode[];
//     const scalarFields = fieldNodes
//       .filter(({ name, selectionSet }) => name.value !== 'id' && !selectionSet)
//       .map(node => node.name.value);
//     const relationFields = fieldNodes
//       .filter(({ selectionSet }) => selectionSet)
//       .map(node => ({
//         name: node.name.value,
//         alias: node.alias && node.alias.value,
//       }));

//     const args: FullArgs = keysToObject(
//       argNodes || [],
//       ({ value, name }) => valueFromAST(value, argTypes[name.value].type),
//       ({ name }) => name.value,
//     );

//     data[field.type] = data[field.type] || {};
//     if (
//       !root.type ||
//       fieldIs.foreignRelation(field) ||
//       (field.isList && args.sort)
//     ) {
//       firstIds[path] = {};
//     }
//     Object.keys(queryResults).forEach(rootId => {
//       if (root.type && fieldIs.relation(field) && field.isList && !args.sort) {
//         if (data[root.type][rootId]![root.field]) {
//           (data[root.type][rootId]![root.field] as FieldValue[]).unshift(
//             args.start || 0,
//           );
//         }
//       }
//       queryResults[rootId].forEach(
//         (record, index) =>
//           record &&
//           (!args.trace ||
//             args.trace.start === undefined ||
//             index < args.trace.start ||
//             args.trace.end === undefined ||
//             index >= args.trace.end) &&
//           (data[field.type][record.id] = {
//             ...(data[field.type][record.id] || {}),
//             ...keysToObject(scalarFields, f => record[f]),
//             ...keysToObject(
//               relationFields,
//               ({ name, alias }) =>
//                 record[alias || name] &&
//                 mapArray(record[alias || name], rec => rec && rec.id),
//               ({ name }) => name,
//             ),
//           }),
//       );
//       if (firstIds[path]) {
//         firstIds[path][rootId] = (queryResults[rootId][args.offset || 0] || {}
//         ).id;
//       }
//     });

//     fieldNodes.filter(({ selectionSet }) => selectionSet).forEach(node =>
//       processLayer(
//         {
//           type: field.type,
//           field: node.name.value,
//         },
//         schema[field.type][node.name.value] as
//           | ForeignRelationField
//           | RelationField,
//         node,
//         Object.keys(queryResults).reduce(
//           (res, rootId) => ({
//             ...res,
//             ...keysToObject(
//               queryResults[rootId].filter(record => record) as Obj[],
//               record =>
//                 toArray(
//                   record[node.alias ? node.alias.value : node.name.value],
//                 ),
//               record => record.id,
//             ),
//           }),
//           {},
//         ),
//         `${path}_${node.alias ? node.alias.value : node.name.value}`,
//       ),
//     );
//   };

//   const rootNodes = operationNode.selectionSet.selections as FieldNode[];
//   rootNodes.forEach(node =>
//     processLayer(
//       { field: node.name.value },
//       { type: node.name.value, isList: true },
//       node,
//       { '': result![node.alias ? node.alias.value : node.name.value] || [] },
//       node.alias ? node.alias.value : node.name.value,
//     ),
//   );
//   return { firstIds };
// }
