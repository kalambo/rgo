import {
  Enhancer,
  Field,
  Obj,
  Resolver,
  ResolveRequest,
  ResolveResponse,
} from '../typings';

export default function base(
  enhancer: (
    resolver: Resolver,
    request: ResolveRequest,
    schema: Obj<Obj<Field>>,
  ) => Promise<ResolveResponse>,
) {
  return (resolver => {
    let schema: Obj<Obj<Field>>;
    return async (request?: ResolveRequest) => {
      if (!schema) schema = await resolver();
      if (!request) return schema;
      return await enhancer(resolver, request, schema);
    };
  }) as Enhancer;
}
