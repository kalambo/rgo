import network from '../network';
import { Field, Obj, Resolver } from '../typings';

export default function fetchResolver(
  url: string,
  getHeaders?: () => Obj | null,
) {
  const doFetch = (async (request = null) =>
    await (await fetch(url, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': request ? 'application/json' : 'text/plain',
        ...getHeaders ? getHeaders() : {},
      }),
      ...request ? { body: JSON.stringify(request) } : {},
    })).json()) as Resolver;

  let schema: Obj<Obj<Field>>;
  return (async request => {
    if (!schema) schema = await doFetch();
    if (!request) return schema;
    const response = await doFetch(network.request('encode', schema, request));
    return network.response('decode', schema, response);
  }) as Resolver;
}
