// TODO: client (and also server) have list of fields needed to know where any record fits into all slices

import { getDataRecordValue, mergeData } from './data';
import { updateRanges } from './ranges';
import { buildRequests } from './requests';
import { runDataUpdate, runSearchUpdate } from './run';
import { getNewSearches } from './searches';
import { Data, DataRanges, Requests, Schema, Search, State } from './typings';
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
  resolve: (
    request: { requests?: Requests; commits?: Data[] },
    onResolve: (data: Data, ranges: DataRanges) => void,
  ) => void,
  watchChanges: (onChange: (data: Data) => void) => void,
) => {
  let state: State = {
    schema,
    queries: [],
    data: { server: {}, client: {}, ranges: {} },
    requests: [],
  };

  const doFetch = ({
    requests = [],
    commits = [],
  }: {
    requests?: Search[];
    commits?: Data[];
  }) => {
    const requestSearches = getNewSearches(state.requests, requests);
    const newRequests = buildRequests(requestSearches);
    if (newRequests || commits) {
      state = { ...state, requests: [...state.requests, ...requestSearches] };
      resolve(
        { requests: newRequests || [], commits: commits || [] },
        (data, ranges) => {
          const newData = {
            ...combineData(state, 'server', data),
            ranges: merge(state.data.ranges, ranges),
          };
          runDataUpdate(state, newData);
          state = {
            ...state,
            data: newData,
            requests: requests.filter(r => !requestSearches.includes(r)),
          };
        },
      );
    }
  };

  watchChanges(data => {
    const newData = {
      ...state.data,
      server: merge(state.data.server, data),
      ranges: updateRanges(state, data),
    };
    doFetch({ requests: runDataUpdate(state, newData) });
    state = { ...state, data: newData };
  });

  return {
    query(searches: Search[], onChange: () => {}) {
      state = { ...state, queries: [...state.queries, { searches, onChange }] };
      doFetch({ requests: runDataUpdate(state, state.data) });
      return (newSearches: Search[]) => {
        const index = state.queries.findIndex(q => q.searches === searches);
        doFetch({ requests: runSearchUpdate(state, index, newSearches) });
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
      doFetch({ requests: runDataUpdate(state, newData) });
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
