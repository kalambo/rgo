import * as baseSources from './sources';
export { baseSources as sources };
export { ServerPlugin } from './typings';

import {
  Field,
  keysToObject,
  Obj,
  Query,
  QueryLayer,
  read,
  Record,
  RgoRequest,
  RgoResponse,
  run,
  Source,
  standardiseQuery,
} from '../core';

import commit from './commit';
import { ServerPlugin } from './typings';

export default async function buildServer(
  config: Obj<{ schema: Obj<Field>; source: Source }>,
  ...plugins: ServerPlugin[]
) {
  const types = Object.keys(config);
  const schema = keysToObject<Obj<Field>>(types, type => ({
    id: { scalar: 'string' },
    createdat: { scalar: 'date' },
    modifiedat: { scalar: 'date' },
    ...config[type].schema,
  }));
  const sources = keysToObject<Source>(types, type => config[type].source);
  const runQuery = async (...queries: Query<string>[]) => {
    const data: Obj<Obj<Record>> = {};
    const firstIds: Obj<Obj<string | null>> = {};
    const q = queries.map(q => standardiseQuery(q, schema));
    await run(q, schema, { sources, data, firstIds });

    const getStart = (
      { args, path, key }: QueryLayer,
      rootId: string,
      recordIds: (string | null)[],
    ) => {
      const fieldPath = [...path, key].join('_');
      return (
        (firstIds[fieldPath] &&
          recordIds.indexOf(firstIds[fieldPath][rootId])) ||
        args.start ||
        0
      );
    };
    const result = {};
    read(q, schema, { data, records: { '': { '': result } }, getStart });
    return result;
  };

  return async (
    request: RgoRequest,
    headers: Obj = {},
  ): Promise<RgoResponse> => {
    let context = {};
    for (const p of plugins) {
      if (p.onRequest) {
        context = {
          ...((await p.onRequest(
            { request, headers },
            { schema, runQuery, context },
          )) || {}),
        };
      }
    }

    const data: Obj<Obj<Record>> = {};
    const commits = await commit(
      { schema, runQuery, context },
      sources,
      plugins.filter(p => !!p.onCommit).map(p => p.onCommit!),
      data,
      request.commits,
    );
    const firstIds = {} as Obj<Obj<string>>;
    await Promise.all(
      run(request.queries, schema, { sources, data, records: {}, firstIds }),
    );

    return { data, firstIds, commits };
  };
}
