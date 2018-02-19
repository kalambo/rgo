import { Data, Enhancer, Obj, Record, Schema } from '../typings';
import { getId, mapData, merge, mergeRecord } from '../utils';

import base from './base';

export default function onCommit(
  map: (
    commit: Data,
    info: { schema: Schema; context: Obj },
  ) => Data | void | Promise<Data | void>,
) {
  return base(async (resolver, request, schema) => {
    if (!request.commits) return await resolver(request);
    request.context = request.context || {};
    const info = { schema, context: request.context };
    const mapped: Data<Record>[] = [];
    const commits: Data[] = [];
    const errors: (string | null)[] = await Promise.all(
      request.commits.map(async commit => {
        try {
          const result = await map(commit, info);
          if (result) {
            mapData(result, (record, type, id) => {
              if (!record) delete result[type][id];
            });
            mapped.push(result as Data<Record>);
            commits.push(merge(commit, result, 2));
          } else {
            commits.push(commit);
          }
          return null;
        } catch (error) {
          return error.message;
        }
      }),
    );
    const response = await resolver({ ...request, commits });
    mapped.forEach((records, i) => {
      if (!response.errors[i]) {
        mapData(records, (record, type, id) => {
          response.data[type] = response.data[type] || {};
          mergeRecord(
            response.data[type],
            getId(id, response.newIds[type])!,
            record,
          );
        });
      }
    });
    let counter = 0;
    return {
      ...response,
      errors: errors.map(
        error =>
          typeof error === 'string' ? error : response.errors[counter++],
      ),
    };
  }) as Enhancer;
}
