import { keysToObject, Obj } from 'mishmash';
import { ArgumentNode, StringValueNode } from 'graphql';

import { Args, Data } from '../core';

export interface Changes {
  changes: Data<true>;
  rootChanges: {
    added: string[];
    removed: string[];
  };
}

export const buildArgs = (args: ArgumentNode[] = [], variables: Obj): Args =>
  keysToObject(
    args,
    ({ value }) => {
      if (value.kind === 'Variable') return variables[value.name.value];
      if (value.kind === 'IntValue') return parseInt(value.value, 10);
      return (value as StringValueNode).value;
    },
    ({ name }) => name.value,
  );
