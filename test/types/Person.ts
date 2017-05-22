import { Db } from 'mongodb';

import buildType from '../buildType';

export default function Person(db: Db) {
  return buildType(
    db.collection('test_hub_people'),
    {
      firstName: {
        scalar: 'String',
      },
      lastName: {
        scalar: 'String',
      },
      emails: {
        scalar: 'String',
        isList: true,
        rules: {
          email: true,
        },
      },
    },
  );
}
