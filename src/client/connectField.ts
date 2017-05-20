import { connectStores } from 'mishmash';

import { DataKey } from '../core';

interface FieldConfig {
  store?: string;
  dataKey: DataKey;
  optional?: boolean;
  hideInvalid?: boolean;
};

const inputTypes = {
  ID: 'text',
  Boolean: 'boolean',
  Int: 'int',
  Float: 'float',
  String: 'text',
  Date: 'date',
  File: 'file',
  JSON: 'json',
};

export default function connectField(mapPropsToConfig: (props: any) => FieldConfig) {
  return connectStores((stores, props) => {

    const { store = 'data', dataKey, optional, hideInvalid } = mapPropsToConfig(props);
    const { scalar, isList, rules } = stores[store].schema(dataKey);

    return {
      type: `${inputTypes[scalar]}${isList ? 'list': ''}`,
      value: stores[store].value(dataKey),
      onChange: (value) => stores[store].set(dataKey, value),
      invalid: !hideInvalid && !stores[store].valid(dataKey, optional),
      editing: stores[store].editing(dataKey),
      rules,
    };

  });
}
