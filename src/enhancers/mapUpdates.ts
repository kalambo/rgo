import keysToObject from 'keys-to-object';

import { Enhancer, IdRecord, Obj, Record, ResolveRequest } from '../typings';
import { localPrefix } from '../utils';

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
      const updates = await Promise.all(
        request.updates.map(async update => {
          try {
            const types = Object.keys(update);
            return keysToObject<IdRecord[]>(
              await Promise.all(
                types.map(type =>
                  Promise.all(
                    update[type].map(async ({ id, ...record }) => ({
                      id,
                      ...((await map(
                        type,
                        id.startsWith(localPrefix) ? null : id,
                        Object.keys(record).length === 0 ? null : record,
                      )) || record),
                    })),
                  ),
                ),
              ),
              records => records,
              (_, i) => types[i],
            );
          } catch (error) {
            return error.message as string;
          }
        }),
      );

      const response = await resolver({
        ...request,
        updates: updates.filter(u => typeof u !== 'string') as Obj<
          IdRecord[]
        >[],
      });
      let counter = 0;
      return {
        ...response,
        newIds: request.updates.map(
          (_, i) =>
            typeof updates[i] === 'string'
              ? updates[i]
              : response.newIds[counter++],
        ),
      };
    };
  }) as Enhancer;
}
