open Belt;
open Types;
open Data;
open Split;
open Run;
open Prepare;
open Utils;

let runDataUpdate = ({schema, queries, data}, newData) =>
  queries
  |. List.map(((searches, onChange)) =>
       switch (run(schema, data, newData, searches, searches)) {
       | (Some(change), requests) =>
         onChange(change);
         requests;
       | (_, requests) => requests
       }
     )
  |. List.flatten;

let runSearchUpdate = ({schema, queries, data}, newSearches, onChange) =>
  queries
  |. List.map(((searches, queryOnChange)) =>
       if (queryOnChange == onChange) {
         switch (run(schema, data, data, searches, newSearches)) {
         | (Some(change), requests) =>
           onChange(change);
           requests;
         | (_, requests) => requests
         };
       } else {
         [];
       }
     )
  |. List.flatten;

let default =
    (
      schema: schema,
      send: (int, list(search), list(data)) => unit,
      listen:
        (
          (option(int), nullData, Map.String.t(list(ranges))) => unit,
          unit
        ) =>
        unit,
    ) => {
  let state =
    ref({
      schema,
      queries: [],
      data: {
        server: Map.String.empty,
        client: Map.String.empty,
        ranges: Map.String.empty,
      },
      requests: Map.Int.empty,
      index: 0,
    });

  let doFetch = (searches: list(search), commits: list(data)) => {
    let searches =
      getNewSearches(
        state^.requests
        |. Map.Int.valuesToArray
        |. List.fromArray
        |. List.flatten,
        searches,
      );
    if (List.length(searches) > 0 || List.length(commits) > 0) {
      state :=
        {
          ...state^,
          requests:
            state^.requests |. Map.Int.set(state^.index + 1, searches),
          index: state^.index + 1,
        };
      send(state^.index, searches, commits);
    };
  };

  let unlisten =
    listen((index, data, ranges) => {
      let newData = {
        ...state^.data,
        server: mergeNullData(state^.data.server, data),
        ranges:
          Map.String.merge(
            updateRanges(state^.schema, state^.data, data),
            ranges,
            (_, ranges1, ranges2) =>
            Some(
              List.concat(
                switch (ranges1) {
                | Some(ranges1) => ranges1
                | None => []
                },
                switch (ranges2) {
                | Some(ranges2) => ranges2
                | None => []
                },
              ),
            )
          ),
      };
      let requests = runDataUpdate(state^, newData);
      switch (index) {
      | Some(index) =>
        state :=
          {
            ...state^,
            data: newData,
            requests: state^.requests |. Map.Int.remove(index),
          }
      | None =>
        doFetch(requests, []);
        state := {...state^, data: newData};
      };
    });

  (
    (searches: list(userSearch), onChange: list((string, change)) => unit) => {
      let searches = searches |. List.map(prepareSearch);
      let prevState = state^;
      state :=
        {...state^, queries: [(searches, onChange), ...state^.queries]};
      doFetch(runSearchUpdate(prevState, searches, onChange), []);
      (newSearches: list(userSearch)) => {
        let newSearches = newSearches |. List.map(prepareSearch);
        let prevState = state^;
        state :=
          {
            ...state^,
            queries:
              state^.queries
              |. List.map(((searches, queryOnChange)) =>
                   queryOnChange == onChange ?
                     (newSearches, onChange) : (searches, onChange)
                 ),
          };
        doFetch(runSearchUpdate(prevState, newSearches, onChange), []);
      };
    },
    (update: nullData) => {
      let newData = {
        ...state^.data,
        client: mergeNullNullData(state^.data.client, update),
      };
      doFetch(runDataUpdate(state^, newData), []);
      state := {...state^, data: newData};
    },
    (fields: list((string, string, string))) =>
      doFetch(
        [],
        [
          fields
          |. List.reduce(Map.String.empty, (data, (store, id, field)) =>
               switch (
                 switch (get2(state^.data.client, store, id)) {
                 | Some(Some(clientRecord)) =>
                   clientRecord |. Map.String.get(field)
                 | _ => None
                 }
               ) {
               | Some(value) =>
                 data
                 |. Map.String.update(store, records =>
                      Some(
                        (
                          switch (records) {
                          | Some(records) => records
                          | None => Map.String.empty
                          }
                        )
                        |. Map.String.update(id, record =>
                             Some(
                               (
                                 switch (record) {
                                 | Some(record) => record
                                 | None => Map.String.empty
                                 }
                               )
                               |. Map.String.set(field, value),
                             )
                           ),
                      )
                    )
               | None => data
               }
             ),
        ],
      ),
    unlisten,
  );
};