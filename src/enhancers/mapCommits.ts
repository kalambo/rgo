import { Data, Enhancer, Obj, Schema } from '../typings';
import { mapData, merge } from '../utils';

import base from './base';

export default function mapUpdates(
  map: (
    commit: Data,
    index: number,
    info: { schema: Schema; context: Obj },
  ) => Data | Promise<Data>,
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
      mapData(records, (record, type, id) => {
        if (!record) delete records[type][id];
      });
      return merge(request.commits![i], records);
    });
    const response = await resolver({
      ...request,
      commits: commits.filter(u => typeof u !== 'string') as Data[],
    });
    (mapped.filter(u => typeof u !== 'string') as Data[]).forEach(
      (records, i) => {
        mapData(records, (record, type, id) => {
          const newId =
            (response.newIds[i][type] && response.newIds[i][type][id]) || id;
          response.data[type] = response.data[type] || {};
          response.data[type][newId] = {
            ...response.data[type][newId],
            ...record,
          };
        });
      },
    );
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
