import keysToObject from 'keys-to-object';

import { getDataRecordValue, mergeData } from './data';
import { updateRanges } from './ranges';
import { runDataUpdate, runSearchUpdate } from './run';
import { getNewSearches } from './searches';
import { Data, DataRanges, Schema, Search, State } from './typings';
import { flatten, merge } from './utils';

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
  connection: {
    send: (index: number, searches: Search[], commits: Data[]) => void;
    listen: (
      onReceive: (index: number | null, data: Data, ranges: DataRanges) => void,
    ) => () => void;
  },
) => {
  let state: State = {
    schema,
    queries: [],
    data: { server: {}, client: {}, ranges: {} },
    requests: {},
  };

  const doFetch = ({
    searches = [],
    commits = [],
  }: {
    searches?: Search[];
    commits?: Data[];
  }) => {
    const keys = Object.keys(state.requests);
    const newSearches = getNewSearches(
      flatten(keys.map(k => state.requests[k])),
      searches,
    );
    if (newSearches.length > 0 || commits.length > 0) {
      const index =
        keys.length === 0 ? 0 : Math.max(...keys.map(k => parseInt(k, 10))) + 1;
      state = {
        ...state,
        requests: { ...state.requests, [index]: newSearches },
      };
      connection.send(index, newSearches, commits);
    }
  };

  connection.listen((index, data, ranges) => {
    if (index !== null) {
      const newData = {
        ...combineData(state, 'server', data),
        ranges: merge(state.data.ranges, ranges),
      };
      runDataUpdate(state, newData);
      state = {
        ...state,
        data: newData,
        requests: keysToObject(
          Object.keys(state.requests).filter(k => parseInt(k, 10) !== index),
          k => state.requests[k],
        ),
      };
    } else {
      const newData = {
        ...state.data,
        server: merge(state.data.server, data),
        ranges: updateRanges(state, data),
      };
      doFetch({ searches: runDataUpdate(state, newData) });
      state = { ...state, data: newData };
    }
  });

  return {
    query(searches: Search[], onChange: () => {}) {
      state = { ...state, queries: [...state.queries, { searches, onChange }] };
      doFetch({ searches: runDataUpdate(state, state.data) });
      return (newSearches: Search[]) => {
        const index = state.queries.findIndex(q => q.searches === searches);
        doFetch({ searches: runSearchUpdate(state, index, newSearches) });
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
      doFetch({ searches: runDataUpdate(state, newData) });
      state = { ...state, data: newData };
    },

    commit(fields: { store: string; id: string; field: string }[]) {
      doFetch({
        commits: [
          fields.reduce((res, { store, id, field }) => {
            res[store] = res[store] || {};
            res[store][id] = res[store][id] || {};
            res[store][id][field] = getDataRecordValue(
              state.schema,
              state.data.client,
              store,
              id,
              field,
            );
            return res;
          }, {}),
        ],
      });
    },
  };
};
