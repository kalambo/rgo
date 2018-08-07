import network from '../network';
import { Obj, Resolver, Schema } from '../typings';

export default function fetchResolver(
  url: string,
  getHeaders?: () => Obj | null,
  refresh?: () => Promise<boolean>,
) {
  const doFetch = (async (request: Obj | null = null) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: new Headers({
        'Content-Type': request ? 'application/json' : 'text/plain',
        ...(getHeaders ? getHeaders() : {}),
      }),
      ...(request ? { body: JSON.stringify(request) } : {}),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  }) as Resolver;

  let schema: Schema;
  return (async request => {
    if (!schema) schema = await doFetch();
    if (!request) return schema;
    const resolve = async () => {
      const response = await doFetch(
        network.request('encode', schema, request),
      );
      return network.response('decode', schema, response);
    };
    try {
      return await resolve();
    } catch (error) {
      if (!refresh || !(await refresh())) throw error;
      return await resolve();
    }
  }) as Resolver;
}
