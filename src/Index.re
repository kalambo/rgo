open Belt;
open Types;
open Misc;

type state = {
  queries: list(query),
  listeners: list(changes => unit),
  ledger: list(selection),
  serverData: data,
  localData: data,
};

let mergeData = (data1: data, data2: data) => data1;

type dataRequest = unit;

let fetchData = (request: dataRequest, onResult: data => unit) => ();

let addQueryToLedger =
    (
      ledger: list(selection),
      serverData: data,
      localData: data,
      query: query,
    ) => (
  ledger,
  (),
);

let addUpdatesToLedger =
    (
      ledger: list(selection),
      serverData: data,
      localData: data,
      updates: data,
    ) => (
  ledger,
  (),
);

type dataChangeType =
  | ServerUpdate
  | LocalUpdate;

type combinedUpdates = unit;

let getCombinedDataChanges =
    (
      serverData: data,
      localData: data,
      changeType: dataChangeType,
      updates: data,
    ) =>
  ();

let mapUpdatesToQuery = (query: query, updates: combinedUpdates) => None;

let emitChanges =
    (
      queries: list(query),
      listeners: list(changes => unit),
      updates: combinedUpdates,
    ) =>
  List.forEachWithIndex(queries, (i, query) =>
    switch (mapUpdatesToQuery(query, updates), List.get(listeners, i)) {
    /* OUTPUT: call listener with changes */
    | (Some(changes), Some(listener)) => listener(changes)
    | _ => ()
    }
  );

let loadData = (state: ref(state), updates: data) => {
  let {queries, listeners, serverData, localData} = state^;

  state := {...state^, serverData: mergeData(serverData, updates)};

  emitChanges(
    queries,
    listeners,
    getCombinedDataChanges(serverData, localData, ServerUpdate, updates),
  );
};

let addQuery = (state: ref(state), query: query, listener: changes => unit) => {
  let {queries, listeners, ledger, serverData, localData} = state^;

  let (newLedger, newRequest) =
    addQueryToLedger(ledger, serverData, localData, query);

  state :=
    {
      ...state^,
      queries: [query, ...queries],
      listeners: [listener, ...listeners],
      ledger: newLedger,
    };

  /* MAYBE ASYNC: set data request fetching */
  fetchData(newRequest, loadData(state));
};

let setLocalData = (state: ref(state), updates: data) => {
  let {queries, listeners, ledger, serverData, localData} = state^;

  let (newLedger, newRequest) =
    addUpdatesToLedger(ledger, serverData, localData, updates);

  state :=
    {...state^, ledger: newLedger, localData: mergeData(localData, updates)};

  emitChanges(
    queries,
    listeners,
    getCombinedDataChanges(serverData, localData, LocalUpdate, updates),
  );

  /* MAYBE ASYNC: set data request fetching */
  fetchData(newRequest, loadData(state));
};