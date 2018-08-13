import { emitChanges } from './changes';
import { getSearchesRequest } from './ledger';
import { Data, Search, State } from './typings';

const getUpdateRequest = (state: State, update: Data) => {};

const mergeData = (data1: Data, data2: Data) => ({});

const combineData = (state: State, type: 'client' | 'server', update: Data) => {
  const newData = {};
  const changes = {};

  return [newData, changes];
};

export default () => {
  let state: State = {
    schema: {},
    queries: [],
    server: {},
    client: {},
  };

  const fetchData = async request => {
    // ASYNC LOAD
    const [newData, changes] = combineData(state, 'server', {});
    state = { ...state, server: newData };
    emitChanges(state, changes);
  };

  return {
    query(searches: Search[], onChange: () => {}) {
      state = { ...state, queries: [...state.queries, { searches, onChange }] };
      fetchData(getSearchesRequest(state, searches));
    },

    set(update: Data) {
      const newRequest = getUpdateRequest(state, update);
      const [newData, changes] = combineData(state, 'client', update);
      state = { ...state, client: newData };
      emitChanges(state, changes);
      fetchData(newRequest);
    },
  };
};
