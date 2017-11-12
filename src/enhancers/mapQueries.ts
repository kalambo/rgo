import { Enhancer, Field, FullQuery, Obj, ResolveRequest } from '../typings';
import walker from '../walker';

const queryMapper = walker<
  FullQuery,
  { map: (filter?: any[]) => any[] | undefined }
>(({ root, args, fields, offset, trace }, { map }, walkRelations) => ({
  name: root.field,
  alias: root.alias,
  ...args,
  filter: map(args.filter),
  fields: [...fields, ...walkRelations()],
  offset,
  trace,
}));

export default function mapQueries(map: (filter?: any[]) => any[] | undefined) {
  return (resolver => {
    let schema: Obj<Obj<Field>>;
    return async (request?: ResolveRequest) => {
      if (!schema) schema = await resolver();
      if (!request) return schema;
      return await resolver({
        commits: request.commits,
        queries: queryMapper(request.queries, schema, { map }),
      });
    };
  }) as Enhancer;
}
