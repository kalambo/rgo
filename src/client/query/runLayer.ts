import { createEmitter, keysToObject, Obj } from '../../core';

import { Changes, ClientState, QueryLayer } from '../typings';

import initRoot from './initRoot';

export default function runLayer(
  layer: QueryLayer,
  rootRecords: Obj<Obj>,
  state: ClientState,
  queryResults: Obj<Obj[]>,
  onChanges?: (listener: (value: Changes) => void) => () => void,
) {
  layer.state.rootIds = Object.keys(rootRecords);
  layer.state.rootRecordIds = {};
  layer.state.records = {};

  const allIds = Object.keys(state.combined[layer.field.type] || {});
  layer.state.filteredIdsObj = keysToObject(allIds, layer.funcs.filter);
  layer.state.filteredIds = allIds
    .filter(id => layer.state.filteredIdsObj[id])
    .sort(layer.funcs.compare);

  layer.state.rootIds.forEach(rootId =>
    initRoot(rootId, layer, rootRecords, state, queryResults),
  );

  const changesEmitter = createEmitter<Changes>();
  const stopRelations = layer.relations.map(relationLayer =>
    runLayer(
      relationLayer,
      layer.state.records,
      state,
      layer.state.rootIds.reduce(
        (res, rootId) => ({
          ...res,
          ...keysToObject(
            queryResults[rootId],
            record => record[relationLayer.root.field],
            record => record.id,
          ),
        }),
        {},
      ),
      onChanges && changesEmitter.watch,
    ),
  );

  // const stop =
  //   onChanges &&
  //   onChanges(changes =>
  //     changesEmitter.emit({
  //       changes: changes.changes,
  //       rootChanges: update(
  //         layer,
  //         rootRecords,
  //         state,
  //         queryResults,
  //         offsets,
  //         changes,
  //       ),
  //     }),
  //   );

  return () => {
    stopRelations.forEach(s => s());
    // stop && stop();
  };
}
