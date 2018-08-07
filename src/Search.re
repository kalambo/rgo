open Belt;
open Types;

let doRangesIntersect = (r1, r2) =>
  (
    switch (r1, r2) {
    | ((Some(a1), _), (_, Some(b2))) => a1 <= b2
    | _ => true
    }
  )
  && (
    switch (r1, r2) {
    | ((_, Some(b1)), (Some(a2), _)) => a2 <= b1
    | _ => true
    }
  );

let intersectRanges = ((a1, b1) as r1, (a2, b2) as r2) =>
  doRangesIntersect(r1, r2) ? Some((max(a1, a2), min(b1, b2))) : None;

let intersectFilters = (f1, f2) => {
  let noIntersect = ref(false);
  let result =
    Map.merge(f1, f2, (_, r1, r2) =>
      noIntersect^ ?
        None :
        (
          switch (r1, r2) {
          | (Some(r1), Some(r2)) =>
            switch (intersectRanges(r1, r2)) {
            | Some(r3) => Some(r3)
            | None =>
              noIntersect := true;
              None;
            }
          | (Some(r), None)
          | (None, Some(r)) => Some(r)
          | (None, None) => None
          }
        )
    );
  noIntersect^ ? None : Some(result);
};

let rec buildFilters = filter =>
  switch (filter) {
  | And(filters) =>
    let filterSets = List.map(filters, buildFilters);
    List.reduce(filterSets, [makeFieldMap([])], (res, filters) =>
      List.map(res, f1 =>
        List.keepMap(filters, f2 => intersectFilters(f1, f2))
      )
      |. List.flatten
    );
  | Or(filters) => filters |. List.map(buildFilters) |. List.flatten
  | Leaf((field, op)) =>
    switch (op) {
    | Eq(value) => [makeFieldMap([(field, (Some(value), Some(value)))])]
    | Neq(value) => [
        makeFieldMap([(field, (None, Some(value)))]),
        makeFieldMap([(field, (Some(value), None))]),
      ]
    | Lt(value) => [makeFieldMap([(field, (None, Some(value)))])]
    | Gt(value) => [makeFieldMap([(field, (Some(value), None))])]
    | Lte(value) => [
        makeFieldMap([(field, (None, Some(value)))]),
        makeFieldMap([(field, (Some(value), Some(value)))]),
      ]
    | Gte(value) => [
        makeFieldMap([(field, (Some(value), Some(value)))]),
        makeFieldMap([(field, (Some(value), None))]),
      ]
    | In(value) =>
      List.map(value, v => makeFieldMap([(field, (Some(v), Some(v)))]))
    }
  };

let rec combineSearches =
        (~prev: ledger=Map.String.empty, searches: list(search))
        : ledger =>
  List.reduce(searches, prev, (res, {store, filter, sort, slice, fields}) =>
    Map.String.update(res, store, prev =>
      Some(
        List.reduce(
          switch (filter) {
          | Some(filter) =>
            slice == None ?
              List.map(buildFilters(filter), f => makeFilterSet([f])) :
              [makeFilterSet(buildFilters(filter))]
          | None => [makeFilterSet([makeFieldMap([])])]
          },
          switch (prev) {
          | Some(prev) => prev
          | None => makeFilterSetMap([])
          },
          (res, filterSet) =>
          Map.update(
            res,
            filterSet,
            prev => {
              let sort =
                switch (sort) {
                | Some(sort) => sort
                | None => [(Asc, ["id"])]
                };
              let getFields = (prevFields: option(ledgerFields)) => {
                scalars:
                  (
                    switch (prevFields) {
                    | Some(fields) => fields.scalars
                    | None => Set.make(~id=(module FieldCmp))
                    }
                  )
                  |. Set.mergeMany(
                       List.concatMany([|
                         fields
                         |. List.keepMap(field =>
                              switch (field) {
                              | Field(field) => Some(field)
                              | _ => None
                              }
                            ),
                         filterSet
                         |. Set.toList
                         |. List.map(filter =>
                              filter |. Map.keysToArray |. List.fromArray
                            )
                         |. List.flatten,
                         slice == None ?
                           [] : sort |. List.map(((_, f)) => f),
                       |])
                       |. List.toArray,
                     ),
                searches:
                  combineSearches(
                    ~prev=
                      switch (prevFields) {
                      | Some(fields) => fields.searches
                      | None => Map.String.empty
                      },
                    List.keepMap(fields, field =>
                      switch (field) {
                      | Search(_, search) => Some(search)
                      | _ => None
                      }
                    ),
                  ),
              };
              Some((
                switch (slice, prev) {
                | (None, None) => Some(getFields(None))
                | (None, Some((all, _))) => Some(getFields(all))
                | (Some(_), None) => None
                | (Some(_), Some((all, _))) => all
                },
                {
                  let base =
                    switch (prev) {
                    | None => makeSortMap([])
                    | Some((_, pages)) => pages
                    };
                  switch (slice) {
                  | None => base
                  | Some(slice) =>
                    Map.update(base, sort, prev =>
                      Some(
                        Map.update(
                          switch (prev) {
                          | Some(prev) => prev
                          | None => makeSliceMap([])
                          },
                          slice,
                          prev =>
                          Some(getFields(prev))
                        ),
                      )
                    )
                  };
                },
              ));
            },
          )
        ),
      )
    )
  );