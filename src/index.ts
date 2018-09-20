// @ts-ignore
import buildRgo from './re/Index';

import { toJs, toRe } from './convert';
import { Connection, RequestSearch, Schema, Search } from './typings';

const prepareSearch = ({
  name,
  store,
  filter,
  sort,
  slice,
  fields,
}: Search): RequestSearch => ({
  name,
  store,
  filter: filter || ['AND'],
  sort:
    (sort &&
      (Array.isArray(sort) ? sort : [sort]).map(
        s =>
          s[0] === '-'
            ? { direction: 'DESC' as 'DESC', field: s.slice(1).split('.') }
            : { direction: 'ASC' as 'ASC', field: s.split('.') },
      )) ||
    [],
  slices: slice ? [slice] : [],
  fields: (fields.filter(f => typeof f === 'string') as string[]).map(f =>
    f.split('.'),
  ),
  searches: (fields.filter(f => typeof f !== 'string') as Search[]).map(
    prepareSearch,
  ),
});

export default (schema: Schema, connection: Connection) => {
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
      query(
        searches.map(search => toRe.search(schema, prepareSearch(search))),
        change => onChange(toJs.change(change)),
      );
    },
  };
};
