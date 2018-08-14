import { emitChanges } from './changes';
import { getSearchesRequest } from './ledger';
import { Data, Search, State } from './typings';

const getUpdateRequest = (state: State, update: Data) => {};

const combineData = (state: State, type: 'client' | 'server', update: Data) => {
  const newData = {} as any;
  const changes = {};

  return [newData, changes];
};

export default () => {
  let state: State = {
    schema: {},
    queries: [],
    data: {
      server: {},
      client: {},
      marks: [],
    },
  };

  const fetchData = async request => {
    // ASYNC LOAD
    const [newData, changes] = combineData(state, 'server', {});
    state = { ...state, data: newData };
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
      state = { ...state, data: newData };
      emitChanges(state, changes);
      fetchData(newRequest);
    },
  };
};
