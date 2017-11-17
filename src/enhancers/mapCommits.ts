import { Enhancer, Field, Obj, Record } from '../typings';
import { merge } from '../utils';

import base from './base';

export default function mapUpdates(
  map: (
    commit: Obj<Obj<Record | null>>,
    index: number,
    info: { schema: Obj<Obj<Field>>; context: Obj },
  ) => Record | void | Promise<Record | void>,
) {
  return base(async (resolver, request, schema) => {
    if (!request.commits) return await resolver(request);
    request.context = request.context || {};
    const info = { schema, context: request.context };
    const mapped = await Promise.all(
      request.commits.map(async (commit, i) => {
        try {
          return (await map(commit, i, info)) || commit;
        } catch (error) {
          return error.message as string;
        }
      }),
    );
    const commits = mapped.map(
      (m, i) => (typeof m === 'string' ? m : merge(request.commits![i], m)),
    );
    const filtered = commits.filter(u => typeof u !== 'string') as Obj<
      Obj<Record | null>
    >[];
    const response = await resolver({ ...request, commits: filtered });
    let counter = 0;
    return {
      ...response,
      newIds: commits.map(
        commit =>
          typeof commit === 'string'
            ? (commit as string)
            : response.newIds[counter++],
      ),
      data: merge(response.data, ...filtered),
    };
  }) as Enhancer;
}
