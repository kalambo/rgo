import keysToObject from 'keys-to-object';

import { Enhancer, Obj, Record, ResolveRequest } from '../typings';
import { newIdPrefix } from '../utils';

export default function mapUpdates(
  map: (
    type: string,
    id: string | null,
    record: Record | null,
  ) => Record | void | Promise<Record | void>,
) {
  return (resolver => {
    return async (request?: ResolveRequest) => {
      if (!request) return await resolver();
      const commits = await Promise.all(
        request.commits.map(async records => {
          try {
            const types = Object.keys(records);
            return keysToObject<Obj<Record>>(
              await Promise.all(
                types.map(async type => {
                  const ids = Object.keys(records[type]);
                  return keysToObject<Record>(
                    await Promise.all(
                      ids.map(
                        async id =>
                          (await map(
                            type,
                            id.startsWith(newIdPrefix) ? null : id,
                            records[type][id],
                          )) ||
                          records[type][id] ||
                          {},
                      ),
                    ),
                    res => res,
                    (_, i) => ids[i],
                  );
                }),
              ),
              res => res,
              (_, i) => types[i],
            );
          } catch (error) {
            return error.message as string;
          }
        }),
      );

      const response = await resolver({
        ...request,
        commits: commits.filter(u => typeof u !== 'string') as Obj<
          Obj<Record | null>
        >[],
      });
      let counter = 0;
      return {
        ...response,
        newIds: request.commits.map(
          (_, i) =>
            typeof commits[i] === 'string'
              ? commits[i]
              : response.newIds[counter++],
        ),
      };
    };
  }) as Enhancer;
}
