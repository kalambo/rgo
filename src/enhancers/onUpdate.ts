import { Enhancer, Obj, Record, Schema } from '../typings';
import { isNewId, mapDataAsync } from '../utils';

import onCommit from './onCommit';

export default function alterUpdates(
  map: (
    update: {
      type: string;
      id: string | null;
      record: Record | null;
    },
    info: { schema: Schema; context: Obj },
  ) => Record | void | Promise<Record | void>,
) {
  return onCommit(async (commit, _, info) => {
    return mapDataAsync(commit, async (record, type, id) => {
      const mapped = await map(
        { type, id: isNewId(id) ? null : id, record },
        info,
      );
      return (record && mapped) || null;
    });
  }) as Enhancer;
}
