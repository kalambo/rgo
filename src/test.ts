import { getSearchesRequest } from './requests';

const state = {
  schema: {
    people: {
      address: 'addresses',
    },
  },
  queries: [
    {
      searches: [
        {
          name: 'people',
          store: 'people',
          filter: [['firstName'], '<', 'Dave'] as any,
          fields: [
            ['firstName'],
            ['lastName'],
            ['address', 'city'],
            {
              name: 'addresses',
              store: 'addresses',
              filter: [['city'], '=', 'London'] as any,
              fields: [['postcode']],
            },
          ],
        },
      ],
      onChange: () => {},
    },
  ],
  data: {
    server: {
      people: {
        A: {
          firstName: 'First A',
          lastName: 'Last A',
          email: 'Email A',
          address: 'A',
        },
        B: {
          firstName: 'First B',
          lastName: 'Last B',
          email: 'Email B',
          address: 'B',
        },
      },
      addresses: {
        A: { city: 'City A', postcode: 'Postcode A' },
        B: { city: 'City B', postcode: 'Postcode B' },
      },
    },
    client: {},
    marks: {},
  },
};

console.log(
  JSON.stringify(
    getSearchesRequest(state, [
      {
        name: 'people',
        store: 'people',
        filter: [['firstName'], '<', 'Jon'],
        fields: [
          ['firstName'],
          ['email'],
          ['address', 'postcode'],
          {
            name: 'addresses',
            store: 'addresses',
            fields: [['postcode'], ['street']],
          },
        ],
      },
    ]),
    null,
    2,
  ),
);
