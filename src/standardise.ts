import {
  FieldPath,
  Filter,
  FilterRange,
  isFilterArray,
  Obj,
  Search,
  UserFilter,
  UserSearch,
  Value,
} from './typings';
import { flatten, isObject, maxValue, minValue, unique } from './utils';

const intersectFilterMaps = (f1: Obj<FilterRange>, f2: Obj<FilterRange>) => {
  const result: Obj<FilterRange> = {};
  for (const k of Array.from(
    new Set([...Object.keys(f1), ...Object.keys(f2)]),
  )) {
    const start1 = f1[k] && f1[k].start.value;
    const end1 = f1[k] && f1[k].end.value;
    const start2 = f2[k] && f2[k].start.value;
    const end2 = f2[k] && f2[k].end.value;
    const isPoint1 = start1 !== undefined && start1 === end1;
    const isPoint2 = start2 !== undefined && start2 === end2;
    const start = maxValue(start1, start2);
    const end = minValue(end1, end2);
    if (isPoint1 && isPoint2) {
      if (start1 !== start2) return null;
    } else {
      if (start !== undefined && start === end) {
        if (
          ((start === start1 || end === end1) && !isPoint1) ||
          ((start === start2 || end === end2) && !isPoint2)
        ) {
          return null;
        }
      }
      if (
        start !== undefined &&
        start !== null &&
        end !== undefined &&
        end !== null &&
        start > end
      ) {
        return null;
      }
    }
    result[k] = {
      start: {
        value: start,
        fields: unique([
          ...(f1[k] ? f1[k].start.fields.map(v => JSON.stringify(v)) : []),
          ...(f1[k] ? f2[k].start.fields.map(v => JSON.stringify(v)) : []),
        ]).map(v => JSON.parse(v)),
      },
      end: {
        value: end,
        fields: unique([
          ...(f1[k] ? f1[k].end.fields.map(v => JSON.stringify(v)) : []),
          ...(f1[k] ? f2[k].end.fields.map(v => JSON.stringify(v)) : []),
        ]).map(v => JSON.parse(v)),
      },
    };
  }
  return result;
};

const standardiseFilter = (filter: UserFilter): Filter => {
  if (isFilterArray(filter)) {
    const [type, ...filterParts] = filter;
    const subBoxes = filterParts.map(f => standardiseFilter(f as UserFilter));
    if (type === 'OR') return flatten(subBoxes);
    return filterParts
      .map(f => standardiseFilter(f as UserFilter))
      .reduce((filters1, filters2) =>
        flatten(
          filters1.map(
            f1 =>
              filters2
                .map(f2 => intersectFilterMaps(f1, f2))
                .filter(v => v) as Filter,
          ),
        ),
      );
  }
  const [field, op, value] = filter;
  if (op === 'in') {
    return flatten(
      (value as (Value | null)[]).map(v => standardiseFilter([field, '=', v])),
    );
  }
  const key = field.join('.');
  return flatten((op === '!=' ? '<>' : op).split('').map(o => [
    {
      [key]: {
        start:
          o === '>' || o === '='
            ? isObject(value)
              ? { fields: [(value as any).parent] }
              : { value }
            : { fields: [] },
        end:
          o === '<' || o === '='
            ? isObject(value)
              ? { fields: [(value as any).parent] }
              : { value }
            : { fields: [] },
      },
    },
  ]) as Filter[]);
};

export const standardiseSearch = ({
  name,
  store,
  filter,
  sort,
  slice,
  fields,
}: UserSearch): Search => {
  return {
    name,
    store,
    filter: filter ? standardiseFilter(filter) : [{}],
    sort: sort || [{ field: ['id'], direction: 'ASC' }],
    slice: slice ? [slice] : [{ start: 0 }],
    fields: fields.filter(f => Array.isArray(f)) as FieldPath[],
    searches: (fields.filter(f => !Array.isArray(f)) as UserSearch[]).map(
      standardiseSearch,
    ),
  };
};
