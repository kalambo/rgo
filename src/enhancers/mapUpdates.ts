import keysToObject from 'keys-to-object';

import { Enhancer, Field, Obj, Record } from '../typings';
import { isNewId } from '../utils';

import mapCommits from './mapCommits';

export default function mapUpdates(
  map: (
    type: string,
    id: string | null,
    record: Record | null,
    info: { schema: Obj<Obj<Field>>; context: Obj },
  ) => Record | void | Promise<Record | void>,
) {
  return mapCommits(async (commit, _, info) => {
    const types = Object.keys(commit);
    return keysToObject<Obj<Record>>(
      await Promise.all(
        types.map(async type => {
          const ids = Object.keys(commit[type]);
          return keysToObject<Record>(
            await Promise.all(
              ids.map(async id => {
                const mapped = await map(
                  type,
                  isNewId(id) ? null : id,
                  commit[type][id],
                  info,
                );
                return (commit[type][id] && mapped) || null;
              }),
            ),
            res => res,
            (_, i) => ids[i],
          );
        }),
      ),
      res => res,
      (_, i) => types[i],
    );
  }) as Enhancer;
}
