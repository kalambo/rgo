import { Enhancer, Field, Obj, Record } from '../typings';
import { merge } from '../utils';

import base from './base';

const filter = (commits: (string | Obj<Obj<Record | null>>)[]) =>
  commits.filter(u => typeof u !== 'string') as Obj<Obj<Record | null>>[];

export default function mapUpdates(
  map: (
    commit: Obj<Obj<Record | null>>,
    index: number,
    info: { schema: Obj<Obj<Field>>; context: Obj },
  ) => Obj<Obj<Record | null>> | Promise<Obj<Obj<Record | null>>>,
) {
  return base(async (resolver, request, schema) => {
    if (!request.commits) return await resolver(request);
    request.context = request.context || {};
    const info = { schema, context: request.context };
    const mapped = await Promise.all(
      request.commits.map(async (commit, i) => {
        try {
          return await map(commit, i, info);
        } catch (error) {
          return error.message as string;
        }
      }),
    );
    const commits = mapped.map((records, i) => {
      if (typeof records === 'string') return records;
      for (const type of Object.keys(records)) {
        for (const id of Object.keys(records[type])) {
          if (!records[type][id]) delete records[type][id];
        }
        if (Object.keys(records[type]).length === 0) delete records[type];
      }
      return merge(request.commits![i], records);
    });
    const response = await resolver({ ...request, commits: filter(commits) });
    filter(mapped).forEach((records, i) => {
      for (const type of Object.keys(records)) {
        const newIds = response.newIds[i][type];
        for (const id of Object.keys(records[type])) {
          const newId = (newIds && newIds[id]) || id;
          response.data[type] = response.data[type] || {};
          response.data[type][newId] = {
            ...response.data[type][newId],
            ...records[type][id],
          };
        }
      }
    });
    let counter = 0;
    return {
      ...response,
      newIds: commits.map(
        commit =>
          typeof commit === 'string'
            ? (commit as string)
            : response.newIds[counter++],
      ),
    };
  }) as Enhancer;
}
