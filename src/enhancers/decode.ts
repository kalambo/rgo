import network from '../network';
import { Enhancer, Field, Obj, ResolveRequest } from '../typings';

export default function decode(schema: Obj<Obj<Field>>) {
  return (resolver => {
    return async (request?: ResolveRequest) => {
      if (!request) return await resolver();
      const response = await resolver(
        network.request('decode', schema, request),
      );
      return network.response('encode', schema, response);
    };
  }) as Enhancer;
}
