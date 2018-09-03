const buildObject = (pairs, map) =>
  pairs.reduce((res, [k, x]) => ({ ...res, [k]: map(x) }), {});

const converter = (enums, values) => x => {
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
const convertNonNullValue = converter(
  [],
  [x => x, x => x, x => x, x => x, x => new Date(x)],
);

// value =
//   | Null
//   | Value(nonNullValue);
const convertValue = converter([null], [convertNonNullValue]);

// runValue =
//   | RunValue(value)
//   | RunRecord(array((string, runRecordValue)))
const convertRunValue = converter(
  [],
  [convertValue, x => buildObject(x, convertRunRecordValue)],
);

// runRecordValue =
//   | RunSingle(runValue)
//   | RunList(array(option(runValue)));
const convertRunRecordValue = converter(
  [],
  [convertRunValue, x => x.map(convertRunValue)],
);

// listChange('a, 'b) =
//   | ListAdd(int, array('a))
//   | ListChange(int, 'b)
//   | ListRemove(int, int);
const convertListChange = (convertAdd, convertChange) =>
  converter(
    [],
    [
      (index, v) => ({ index, add: v.map(convertAdd) }),
      (index, v) => ({ index, change: convertChange(v) }),
      (index, v) => ({ index, remove: v }),
    ],
  );

// changeValue =
//   | ChangeValue(runValue)
//   | ChangeRecord(array((string, change)))
const convertChangeValue = converter(
  [],
  [convertRunValue, x => buildObject(x, convertChange)],
);

// change =
//   | ChangeClear
//   | ChangeSetSingle(runValue)
//   | ChangeSetList(array(option(runValue)))
//   | ChangeSingle(array((string, change)))
//   | ChangeList(array(listChange(option(runValue), changeValue)));
const convertChange = converter(
  [undefined],
  [
    convertRunValue,
    x => x.map(convertRunValue),
    x => buildObject(x, convertChange),
    x => x.map(convertListChange(convertRunValue, convertChangeValue)),
  ],
);

export default convertChangeValue;
