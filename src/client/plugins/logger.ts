import * as _ from 'lodash';

import { Plugin } from '../typings';

export default {
  onChange(state) {
    console.log(_.cloneDeep(state));
  },
} as Plugin;
