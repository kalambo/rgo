import { emitUpdateChanges, emitSearchesChanges } from './changes';
import { mergeData } from './data';
import { getSearchesRequests, getUpdateRequests } from './requests';
import { Data, FirstIds, Requests, Schema, Search, State } from './typings';
import { merge } from './utils';

const combineData = (state: State, type: 'server' | 'client', update: Data) => {
  return {
    ...state.data,
    ...(type === 'server'
      ? { server: mergeData(state.data.server, update) }
      : { client: mergeData(state.data.client, update) }),
  };
};

export default (
  schema: Schema,
  resolve: (requests: Requests) => { data: Data; firstIds: FirstIds },
) => {
  let state: State = {
    schema,
    queries: [],
    data: { server: {}, client: {}, firstIds: {} },
  };

  const fetchData = (requests: Requests | null) => {
    if (requests) {
      const { data, firstIds } = resolve(requests);
      const newData = {
        ...combineData(state, 'server', data),
        firstIds: merge(state.data.firstIds, firstIds),
      };
      emitUpdateChanges(state, newData);
      state = { ...state, data: newData };
    }
  };

  return {
    query(searches: Search[], onChange: () => {}) {
      fetchData(getSearchesRequests(state, searches));
      state = { ...state, queries: [...state.queries, { searches, onChange }] };
      return (newSearches: Search[]) => {
        const index = state.queries.findIndex(q => q.searches === searches);
        emitSearchesChanges(state, index, newSearches);
        state = {
          ...state,
          queries: [
            ...state.queries.slice(0, index),
            { searches: newSearches, onChange },
            ...state.queries.slice(index + 1),
          ],
        };
      };
    },

    set(update: Data) {
      const newData = combineData(state, 'client', update);
      emitUpdateChanges(state, newData);
      fetchData(getUpdateRequests(state, newData));
      state = { ...state, data: newData };
    },
  };
};
