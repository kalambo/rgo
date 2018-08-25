import { setup } from './setup';

const rgo = setup();

rgo.query(
  [
    {
      name: 'people',
      store: 'people',
      filter: [['firstName'], '<', 'Jon'] as any,
      fields: [
        ['firstName'],
        ['lastName'],
        // ['address', 'city'],
        // {
        //   name: 'addresses',
        //   store: 'addresses',
        //   filter: [['city'], '=', 'London'] as any,
        //   fields: [['postcode']],
        // },
      ],
    },
  ],
  changes => {
    console.log(JSON.stringify(changes, null, 2));
  },
);
