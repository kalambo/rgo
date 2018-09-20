open Belt;
open Types;
open Data;
open Split;
open Run;
open Utils;

let rec addIdSort = (search: search) : search => {
  ...search,
  sort:
    Array.some(search.sort, (Asc(field) | Desc(field)) =>
      field == [|"id"|]
    ) ?
      search.sort : Array.concat(search.sort, [|Asc([|"id"|])|]),
  searches: search.searches |. Array.map(addIdSort),
};

let runDataUpdate = ({schema, queries, data}, newData) =>
  queries
  |. Array.map(((searches, onChange)) =>
       switch (run(schema, data, newData, searches, searches)) {
       | (Some(change), requests) =>
         onChange(ChangeRecord(change));
         requests;
       | (_, requests) => requests
       }
     )
  |. Array.concatMany;

let runSearchUpdate = ({schema, queries, data}, newSearches, onChange) =>
  queries
  |. Array.map(((searches, queryOnChange)) =>
       if (queryOnChange == onChange) {
         switch (run(schema, data, data, searches, newSearches)) {
         | (Some(change), requests) =>
           onChange(ChangeRecord(change));
           requests;
         | (_, requests) => requests
         };
       } else {
         [||];
       }
     )
  |. Array.concatMany;

let default =
    (
      schema: schema,
      send: (int, array(search), array(nullData)) => unit,
      listen:
        ((option(int), nullData, keyMap(array(ranges))) => unit, unit) =>
        unit,
    ) => {
  let state =
    ref({
      schema,
      queries: [||],
      data: {
        server: [||],
        client: [||],
        ranges: [||],
      },
      requests: [||],
      index: 0,
    });

  let doFetch = (searches: array(search), commits: array(nullData)) => {
    let searches =
      getNewSearches(
        state^.requests |. Array.map(((_, v)) => v) |. Array.concatMany,
        searches,
      );
    if (Array.length(searches) > 0 || Array.length(commits) > 0) {
      state :=
        {
          ...state^,
          requests: state^.requests |. set(state^.index + 1, searches),
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
          merge(
            updateRanges(state^.schema, state^.data, data),
            ranges,
            (_, ranges1, ranges2) =>
            Some(
              Array.concat(
                switch (ranges1) {
                | Some(ranges1) => ranges1
                | None => [||]
                },
                switch (ranges2) {
                | Some(ranges2) => ranges2
                | None => [||]
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
            requests: state^.requests |. remove(index),
          }
      | None =>
        doFetch(requests, [||]);
        state := {...state^, data: newData};
      };
    });

  (
    (searches: array(search), onChange: changeValue => unit) => {
      let searches = searches |. Array.map(search => search |. addIdSort);
      let prevState = state^;
      state :=
        {
          ...state^,
          queries: Array.concat([|(searches, onChange)|], state^.queries),
        };
      doFetch(runSearchUpdate(prevState, searches, onChange), [||]);
      (newSearches: array(search)) => {
        let newSearches = newSearches |. Array.map(addIdSort);
        let prevState = state^;
        state :=
          {
            ...state^,
            queries:
              state^.queries
              |. Array.map(((searches, queryOnChange)) =>
                   queryOnChange == onChange ?
                     (newSearches, onChange) : (searches, onChange)
                 ),
          };
        doFetch(runSearchUpdate(prevState, newSearches, onChange), [||]);
      };
    },
    (update: nullData) => {
      let newData = {
        ...state^.data,
        client: mergeNullNullData(state^.data.client, update),
      };
      doFetch(runDataUpdate(state^, newData), [||]);
      state := {...state^, data: newData};
    },
    (commit: nullData) => doFetch([||], [|commit|]),
    unlisten,
  );
};