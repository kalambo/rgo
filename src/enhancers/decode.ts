import network from '../network';
import { Enhancer } from '../typings';

import base from './base';

export default base(async (resolver, request, schema) =>
  network.response(
    'encode',
    schema,
    await resolver(network.request('decode', schema, request)),
  ),
) as Enhancer;
