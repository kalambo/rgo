import * as _ from 'lodash';

import {
  Data,
  decodeDate,
  Field,
  fieldIs,
  keysToObject,
  mapArray,
  noUndef,
  Obj,
} from '../core';

import { ChangePlugin, DataChanges, DataDiff, FullChanges } from './typings';

export default class ClientState {
  private plugins: ChangePlugin[];

  public server: Data = {};
  public client: Data = {};
  public combined: Data = {};
  public diff: DataDiff = {};

  private listeners: ((value: FullChanges) => void)[] = [];

  constructor(plugins: ChangePlugin[]) {
    this.plugins = plugins;
  }

  public listen(listener: (value: FullChanges) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners.splice(this.listeners.indexOf(listener), 1);
    };
  }

  private emitChanges(changes: DataChanges) {
    this.plugins.forEach(p =>
      p(
        {
          server: this.server,
          client: this.client,
          combined: this.combined,
          diff: this.diff,
        },
        changes,
      ),
    );
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      const changedData = keysToObject(Object.keys(changes), type =>
        keysToObject(Object.keys(changes[type]), id =>
          keysToObject(Object.keys(changes[type][id]), field =>
            noUndef(_.get(this.combined, [type, id, field])),
          ),
        ),
      );
      this.listeners.forEach(l => l({ changes, changedData }));
    }
  }

  private set(store: 'server' | 'client', data: Obj, schema?: Obj<Obj<Field>>) {
    const changes: DataChanges = {};
    const setChanged = (type: string, id: string, field: string) => {
      changes[type] = changes[type] || {};
      changes[type][id] = changes[type][id] || {};
      changes[type][id][field] = true;
    };

    for (const type of Object.keys(data)) {
      if (data[type] === undefined) {
        for (const id of Object.keys(this.client[type] || {})) {
          for (const field of Object.keys(_.get(this.client, type, id) || {})) {
            if (
              !_.isEqual(
                noUndef(_.get(this.combined, [type, id, field])),
                noUndef(_.get(this.server, [type, id, field])),
              )
            ) {
              setChanged(type, id, field);
            }
          }
        }
        delete this.client[type];
        if (_.get(this.server, type)) {
          this.combined[type] = _.cloneDeep(this.server[type]);
        } else {
          delete this.combined[type];
        }
        delete this.diff[type];
      } else {
        this[store][type] = this[store][type] || {};
        this.combined[type] = this.combined[type] || {};
        this.diff[type] = this.diff[type] || {};
        for (const id of Object.keys(data[type])) {
          if (data[type][id] === undefined) {
            for (const field of Object.keys(
              _.get(this.client, type, id) || {},
            )) {
              if (
                !_.isEqual(
                  noUndef(_.get(this.combined, [type, id, field])),
                  noUndef(_.get(this.server, [type, id, field])),
                )
              ) {
                setChanged(type, id, field);
              }
            }
            delete this.client[type][id];
            if (_.get(this.server, [type, id])) {
              this.combined[type][id] = _.cloneDeep(this.server[type][id]);
            } else {
              delete this.combined[type][id];
            }
            delete this.diff[type][id];
          } else if (data[type][id] === null) {
            if (store === 'client') {
              for (const field of Object.keys(this.combined[type][id] || {})) {
                if (_.get(this.combined, [type, id])) {
                  setChanged(type, id, field);
                }
              }
              this.client[type][id] = null;
              delete this.combined[type][id];
              this.diff[type][id] = -1;
            } else {
              for (const field of Object.keys(this.combined[type][id] || {})) {
                if (
                  !_.isEqual(
                    noUndef(_.get(this.combined, [type, id, field])),
                    noUndef(_.get(this.client, [type, id, field])),
                  )
                ) {
                  setChanged(type, id, field);
                }
              }
              delete this.server[type][id];
              if (_.get(this.client, [type, id])) {
                this.combined[type][id] = _.cloneDeep(this.client[type][id]);
                this.diff[type][id] = 1;
              } else {
                delete this.combined[type][id];
              }
            }
          } else {
            this[store][type][id] = this[store][type][id] || {};
            if (_.get(this.client, [type, id]) !== null) {
              this.combined[type][id] = this.combined[type][id] || {};
            }
            for (const field of Object.keys(data[type][id]!)) {
              const prev = noUndef(_.get(this.combined, [type, id, field]));
              if (store === 'client') {
                if (data[type][id][field] === undefined) {
                  delete this.client[type][id]![field];
                  if (noUndef(_.get(this.server, [type, id, field])) !== null) {
                    this.combined[type][id]![field] = this.server[type][id]![
                      field
                    ];
                  } else {
                    delete this.combined[type][id]![field];
                  }
                } else {
                  this.client[type][id]![field] = data[type][id][field];
                  this.combined[type][id]![field] = data[type][id][field];
                }
              } else {
                const f = schema![type][field];
                const isDate = fieldIs.scalar(f) && f.scalar === 'date';
                const fieldValue =
                  data[type][id]![field] === null || !isDate
                    ? data[type][id]![field]
                    : mapArray(data[type][id]![field], decodeDate);
                if (
                  fieldIs.relation(f) &&
                  f.isList &&
                  typeof (fieldValue && fieldValue[0]) === 'number'
                ) {
                  fieldValue.unshift(...new Array(fieldValue.shift()));
                }
                if (
                  _.get(this.client, [type, id]) !== null &&
                  _.get(this.client, [type, id, field]) === undefined
                ) {
                  this.combined[type][id]![field] = fieldValue;
                }
                this.server[type][id]![field] = fieldValue;
              }
              if (
                !_.isEqual(
                  noUndef(_.get(this.combined, [type, id, field])),
                  prev,
                )
              ) {
                setChanged(type, id, field);
              }
            }
            if (
              _.get(this.client, [type, id]) &&
              Object.keys(_.get(this.client, [type, id])).length === 0
            ) {
              delete this.client[type][id];
              delete this.diff[type][id];
            }
            if (
              _.get(this.combined, [type, id]) &&
              Object.keys(_.get(this.combined, [type, id])).length === 0
            ) {
              delete this.combined[type][id];
            }
            if (_.get(changes, [type, id]) && _.get(this.client, [type, id])) {
              this.diff[type][id] =
                this.server[type] && this.server[type][id] ? 0 : 1;
            }
          }
        }
      }
    }
    return changes;
  }

  public setClient(
    values: (
      | { key: [string, string, string]; value: any }
      | { key: [string, string]; value?: null })[],
  ) {
    this.emitChanges(
      this.set(
        'client',
        values.reduce((res, v) => _.set(res, v.key, v.value), {}),
      ),
    );
  }

  public setServer(data: Data, schema: Obj<Obj<Field>>) {
    this.emitChanges(this.set('server', data, schema));
  }
}
