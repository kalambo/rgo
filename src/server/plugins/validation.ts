import { Field, Obj } from '../../core';

import { Plugin } from '../typings';

export default function validation(
  isValid: (field: Field, value: any, record: Obj) => boolean,
): Plugin {
  return {
    onCommit({ type, data }, { schema }) {
      if (data) {
        for (const f of Object.keys(data)) {
          if (!isValid(schema[type][f], data[f], data)) {
            throw new Error('Invalid data');
          }
        }
      }
    },
  };
}
