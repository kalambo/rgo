import network from '../network';
import { Enhancer, Field, Obj, ResolveRequest } from '../typings';

export default (resolver => {
  let schema: Obj<Obj<Field>>;
  return async (request?: ResolveRequest) => {
    if (!schema) schema = await resolver();
    if (!request) return schema;
    const response = await resolver(network.request('decode', schema, request));
    return network.response('encode', schema, response);
  };
}) as Enhancer;
