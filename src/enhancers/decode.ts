import network from '../network';
import { Enhancer, ResolveRequest, Schema } from '../typings';

export default (resolver => {
  let schema: Schema;
  return async (request?: ResolveRequest) => {
    if (!schema) {
      schema = JSON.parse(
        JSON.stringify(
          await resolver(),
          (_, v) => (typeof v === 'function' ? true : v),
        ),
      );
    }
    if (!request) return schema;
    return network.response(
      'encode',
      schema,
      await resolver(network.request('decode', schema, request)),
    );
  };
}) as Enhancer;
