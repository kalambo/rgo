// @ts-ignore
import buildRgo from './re/Index';

import * as toJs from './toJs';
import * as toRe from './toRe';
import { NullData, Obj, Ranges, Schema, Search } from './typings';

export default (
  schema: Schema,
  connection: {
    send: (index: number, searches: Search[], commits: NullData[]) => void;
    listen: (
      onReceive: (
        index: number | undefined,
        data: NullData,
        ranges: Obj<Ranges[]>,
      ) => void,
    ) => () => void;
  },
) => {
  const [query] = buildRgo(
    toRe.schema(schema),
    (index, searches, commits) =>
      connection.send(
        index,
        searches.map(toJs.search),
        commits.map(toJs.nullData),
      ),
    onReceive =>
      connection.listen((index, data, ranges) =>
        onReceive(
          index,
          toRe.nullData(schema, data),
          toRe.ranges(schema, ranges),
        ),
      ),
  );
  return {
    query(searches, onChange) {
      query(searches.map(search => toRe.search(schema, search)), change =>
        onChange(toJs.change(change)),
      );
    },
  };
};
