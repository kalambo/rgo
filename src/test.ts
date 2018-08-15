// import { getSearchesRequests } from './requests';
import { emitUpdateChanges } from './changes';

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
          filter: [['firstName'], '<', 'Jon'] as any,
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
      onChange: changes => console.log(JSON.stringify(changes, null, 2)),
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

emitUpdateChanges(state, {
  ...state.data,
  server: {
    ...state.data.server,
    people: {
      ...state.data.server.people,
      A: {
        ...state.data.server.people.A,
        firstName: 'Bob',
      },
      C: {
        firstName: 'First C',
        lastName: 'Last C',
        email: 'Email C',
        address: 'C',
      },
    },
    addresses: {
      ...state.data.server.addresses,
      C: { city: 'City C', postcode: 'Postcode C' },
    },
  },
});

// console.log(
//   JSON.stringify(
//     getSearchesRequests(state, [
//       {
//         name: 'people',
//         store: 'people',
//         filter: [['firstName'], '<', 'Steve'] as any,
//         fields: [
//           ['firstName'],
//           ['email'],
//           ['address', 'postcode'],
//           {
//             name: 'addresses',
//             store: 'addresses',
//             fields: [['postcode'], ['street']],
//           },
//         ],
//       },
//     ]),
//     null,
//     2,
//   ),
// );

// console.log(
//   JSON.stringify(
//     getUpdateRequests(state, {
//       ...state.data,
//       client: {
//         people: {
//           C: {
//             firstName: 'First C',
//             lastName: 'Last C',
//             email: 'Email C',
//             address: 'C',
//           },
//         },
//         addresses: {
//           C: { city: 'City C', postcode: 'Postcode C' },
//         },
//       },
//     }),
//     null,
//     2,
//   ),
// );
