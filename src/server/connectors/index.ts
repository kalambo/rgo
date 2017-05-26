import { Collection } from 'mongodb';
import { Obj } from 'mishmash';

import { Connector, FieldDbMap } from '../typings';

import mongo from './mongo';

export default {
  mongo: mongo as (
    collection: Collection, fieldDbKeys: Obj<string>, fieldMaps: Obj<FieldDbMap | null>,
  ) => Connector,
};
