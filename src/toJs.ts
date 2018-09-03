import { Change, NullData, RequestSearch } from './typings';

export const buildObject = (pairs, valueMap) =>
  pairs.reduce((res, [key, value]) => ({ ...res, [key]: valueMap(value) }), {});

export const variantToJs = (enums, values) => x => {
  if (x === undefined) return undefined;
  if (typeof x === 'number') return enums[x];
  return values[x.tag](...x);
};

// nonNullValue =
//   | Bool(bool)
//   | Int(int)
//   | Float(float)
//   | String(string)
//   | Date(Js.Date.t);
const nonNullValueToJs = variantToJs(
  [],
  [x => x, x => x, x => x, x => x, x => new Date(x)],
);

// value =
//   | Null
//   | Value(nonNullValue);
const valueToJs = variantToJs([null], [nonNullValueToJs]);

// recordValue =
//   | SingleValue(value)
//   | ArrayValue(array(value));
const recordValueToJs = variantToJs([], [valueToJs, v => v.map(valueToJs)]);

// runValue =
//   | RunValue(value)
//   | RunRecord(keyMap(runRecordValue))
const runValueToJs = variantToJs(
  [],
  [valueToJs, x => buildObject(x, runRecordValueToJs)],
);

// runRecordValue =
//   | RunSingle(runValue)
//   | RunList(array(option(runValue)));
const runRecordValueToJs = variantToJs(
  [],
  [runValueToJs, x => x.map(runValueToJs)],
);

// listChange('a, 'b) =
//   | ListAdd(int, array('a))
//   | ListChange(int, 'b)
//   | ListRemove(int, int);
const listChangeToJs = (addToJs, changeToJs) =>
  variantToJs(
    [],
    [
      (index, v) => ({ index, add: v.map(addToJs) }),
      (index, v) => ({ index, change: changeToJs(v) }),
      (index, v) => ({ index, remove: v }),
    ],
  );

// changeValue =
//   | ChangeValue(runValue)
//   | ChangeRecord(keyMap(change))
const changeValueToJs = variantToJs(
  [],
  [runValueToJs, x => buildObject(x, changeToJs)],
) as (x: any) => Change;

// change =
//   | ChangeClear
//   | ChangeSetSingle(runValue)
//   | ChangeSetArray(array(option(runValue)))
//   | ChangeSingle(keyMap(change))
//   | ChangeArray(array(arrayChange(option(runValue), changeValue)))
const changeToJs = variantToJs(
  [undefined],
  [
    runValueToJs,
    x => x.map(runValueToJs),
    x => buildObject(x, changeToJs),
    x => x.map(listChangeToJs(runValueToJs, changeValueToJs)),
  ],
);

// filterValue = {
//   value: option(value),
//   fields: array(string),
// }
const filterValueToJs = ([value, fields]) => ({ value, fields });

// filterRange =
//   | FilterPoint(filterValue)
//   | FilterRange(filterValue, filterValue);
const filterRangeToJs = variantToJs(
  [],
  [
    x => [filterValueToJs(x)],
    (x, y) => [filterValueToJs(x), filterValueToJs(y)],
  ],
);

// sortPart =
//   | Asc(fieldPath)
//   | Desc(fieldPath);
const sortPartToJs = variantToJs(
  [],
  [
    x => ({ direction: 'ASC', field: x }),
    x => ({ direction: 'DESC', field: x }),
  ],
);

// search = {
//   name: string,
//   store: string,
//   filter,
//   sort,
//   slices: array(slice),
//   fields: array(fieldPath),
//   searches: array(search),
// }
const searchToJs = ([name, store, filter, sort, slices, fields, searches]) =>
  ({
    name,
    store,
    filter: filter.map(filterMap =>
      filterMap.map(([field, range]) => ({
        field,
        range: filterRangeToJs(range),
      })),
    ),
    sort: sort.map(sortPartToJs),
    slices: slices.map(([start, end]) => ({ start, end })),
    fields,
    searches: searches.map(searchToJs),
  } as RequestSearch);

// record = keyMap(recordValue)
const recordToJs = record => buildObject(record, recordValueToJs);

// nullData = keyMap(keyMap(option(record)))
const nullDataToJs = nullData =>
  buildObject(nullData, records =>
    buildObject(records, record => record && recordToJs(record)),
  ) as NullData;

export const change = changeValueToJs;
export const search = searchToJs;
export const nullData = nullDataToJs;
