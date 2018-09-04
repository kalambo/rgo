const setup = require('./setup');

const rgo = setup();

rgo.query(
  [
    {
      name: 'people',
      store: 'people',
      filter: ['firstName', '<', 'Jon'],
      fields: [
        'firstName',
        'lastName',
        // ['address', 'city'],
        // {
        //   name: 'addresses',
        //   store: 'addresses',
        //   filter: [['city'], '=', 'London'],
        //   fields: [['postcode']],
        // },
      ],
    },
  ],
  changes => {
    console.log(JSON.stringify(changes, null, 2));
  },
);
