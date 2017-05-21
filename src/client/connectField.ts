import { connectStores } from 'mishmash';

import { DataKey } from '../core';

export default function connectField(mapPropsToKey: (props: any) => DataKey) {
  return connectStores(({ data }, props) => {

    const dataKey = mapPropsToKey(props);
    const value = data.value(dataKey);
    const schema = data.schema(dataKey);

    return {
      value: value,
      onChange: (value) => data.set(dataKey, value),
      schema: schema,
      invalid: !data.valid(dataKey),
      editing: data.editing(dataKey),
    };

  });
}
