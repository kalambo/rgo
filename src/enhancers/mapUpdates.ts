import { Enhancer, Obj, Record, Schema } from '../typings';
import { isNewId, mapDataAsync } from '../utils';

import mapCommits from './mapCommits';

export default function mapUpdates(
  map: (
    type: string,
    id: string | null,
    record: Record | null,
    info: { schema: Schema; context: Obj },
  ) => Record | void | Promise<Record | void>,
) {
  return mapCommits(async (commit, _, info) => {
    return mapDataAsync(commit, async (record, type, id) => {
      const mapped = await map(type, isNewId(id) ? null : id, record, info);
      return (record && mapped) || null;
    });
  }) as Enhancer;
}
