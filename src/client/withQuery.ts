import { ComponentEnhancer, compose } from 'recompose';
import { connectStores, mapPropsStream, streamState } from 'mishmash';

import prepareQuery from './prepareQuery';

export interface QueryOptions {
  name?: string | null;
  variables?: (props: any) => any;
}

export default function withQuery(query: string, { name = 'data', variables }: QueryOptions = {}) {

  const preparedQuery = prepareQuery(query);

  const dataName = name || 'data';
  const getVariables = props => variables && variables(props);

  return compose(

    connectStores('stores'),

    mapPropsStream(props$ => {

      let previousResult: any = null;

      const mappedProps$ = props$.map(({ stores: { data: { read, query } }, ...props }) => ({
        ...props,
        [dataName]: name ? read(preparedQuery, getVariables(props), previousResult) : null,
        runDataQuery: () => query(preparedQuery, getVariables(props)),
      })).tap(props => previousResult = props[dataName]);

      const { state$: done$, setState: setDone } = streamState(false);

      mappedProps$.take(1).observe(({ runDataQuery }) => {
        runDataQuery().then(() => setDone(true));
      });

      return mappedProps$.combine(({ runDataQuery: _, ...props }, done) => ({
        ...props,
        [dataName]: done ? props[dataName] : 'loading',
      }), done$);

    }),

  ) as ComponentEnhancer<any, any>;

}
