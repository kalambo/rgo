import { compose, pure } from 'recompose';
import { connectStores, HOC, mapPropsStream, streamState } from 'mishmash';

import prepareQuery from './prepareQuery';

export interface QueryOptions {
  name?: string | null;
  variables?: (props: any) => any;
}

export default function withQuery(query: string, options?: QueryOptions) {

  const { name = 'data', variables } = options || {} as QueryOptions;

  const preparedQuery = prepareQuery(query);

  const dataName = name || 'data';
  const getVariables = props => variables && variables(props);

  return compose(

    connectStores('stores'),

    mapPropsStream(props$ => {

      let previousResult: any = null;

      const { state$: done$, setState: setDone } = streamState(false);

      props$.take(1).observe(async ({ stores: { data: { query } }, ...props }) => {
        await query(preparedQuery, getVariables(props));
        setDone(true);
      });

      return props$.combine(({ stores: { data: { read } }, ...props }, done) => ({
        ...props,
        [dataName]: !done ? 'loading' :
          (name ? read(preparedQuery, getVariables(props), previousResult) : null),
      }), done$).tap(props => previousResult = props[dataName]);

    }),

    pure,

  ) as HOC;

}
