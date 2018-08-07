open Search;

/* let schema =
     Js.Dict.fromList([
       (
         "People",
         Js.Dict.fromList([
           ("name", String_),
           ("emails", StringList_),
           ("home", Link_("Places")),
         ]),
       ),
       (
         "Places",
         Js.Dict.fromList([("city", String_), ("population", Int_)]),
       ),
     ]);

   let data =
     Js.Dict.fromList([
       (
         "People",
         Js.Dict.fromList([
           (
             "A",
             Js.Dict.fromList([
               ("name", String("Jon")),
               (
                 "emails",
                 StringList(["jsiwhitehead@gmail.com", "jon@kalambo.org"]),
               ),
               ("home", Link("A")),
             ]),
           ),
           ("B", Js.Dict.fromList([("name", String("Alex"))])),
         ]),
       ),
       (
         "Places",
         Js.Dict.fromList([
           (
             "A",
             Js.Dict.fromList([
               ("city", String("Oxford")),
               ("population", Int(150000)),
             ]),
           ),
         ]),
       ),
     ]); */

[@bs.val]
external stringify : ('a, [@bs.as {json|null|json}] _, [@bs.as 2] _) => string =
  "JSON.stringify";

Js.Console.log(
  stringify(
    combineSearches([
      {
        store: "Places",
        filter: None,
        sort: None,
        slice: None,
        fields: [
          Field(["city"]),
          Search(
            "people",
            {
              store: "People",
              filter: None,
              sort: None,
              slice: None,
              fields: [Field(["name"]), Field(["home", "city"])],
            },
          ),
        ],
      },
    ]),
  ),
);