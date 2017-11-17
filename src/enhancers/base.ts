import {
  Enhancer,
  Resolver,
  ResolveRequest,
  ResolveResponse,
  Schema,
} from '../typings';

export default function base(
  enhancer: (
    resolver: Resolver,
    request: ResolveRequest,
    schema: Schema,
  ) => Promise<ResolveResponse>,
) {
  return (resolver => {
    let schema: Schema;
    return async (request?: ResolveRequest) => {
      if (!schema) schema = await resolver();
      if (!request) return schema;
      return await enhancer(resolver, request, schema);
    };
  }) as Enhancer;
}
