import * as _ from 'lodash';

import {
  decodeDate,
  Field,
  fieldIs,
  FieldValue,
  keysToObject,
  localPrefix,
  mapArray,
  noUndef,
  Obj,
} from '../core';

import { ChangePlugin, DataChanges, DataDiff, FullChanges } from './typings';

export default class ClientState {
  private plugins: ChangePlugin[];

  public server: Obj<Obj<Obj<FieldValue>>> = {};
  public client: Obj<Obj<Obj<FieldValue | null> | null>> = {};
  public combined: Obj<Obj<Obj<FieldValue>>> = {};
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
    const changedData = keysToObject(Object.keys(changes), type =>
      keysToObject(Object.keys(changes[type]), id =>
        keysToObject(Object.keys(changes[type][id]), field =>
          noUndef(_.get(this.combined, [type, id, field])),
        ),
      ),
    );
    this.listeners.forEach(l => l({ changes, changedData }));
  }

  private set(
    store: 'server' | 'client',
    data: Obj<Obj<Obj<FieldValue | null | undefined> | null | undefined>>,
    schema?: Obj<Obj<Field>>,
  ) {
    const changes: DataChanges = {};
    const setChanged = (type: string, id: string, field: string) => {
      changes[type] = changes[type] || {};
      changes[type][id] = changes[type][id] || {};
      changes[type][id][field] = true;
    };

    for (const type of Object.keys(data)) {
      if (data[type] === undefined) {
        if (store === 'client') {
          for (const id of Object.keys(this.client[type] || {})) {
            for (const field of Object.keys(this.client[type][id] || {})) {
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
          if (this.server[type]) {
            this.combined[type] = keysToObject(
              Object.keys(this.server[type]),
              id =>
                keysToObject(
                  Object.keys(this.server[type][id]),
                  field => this.server[type][id][field],
                ),
            );
          } else {
            delete this.combined[type];
          }
          delete this.diff[type];
        }
      } else {
        this[store][type] = this[store][type] || {};
        this.combined[type] = this.combined[type] || {};
        this.diff[type] = this.diff[type] || {};
        for (const id of Object.keys(data[type])) {
          if (
            data[type][id] === undefined ||
            (data[type][id] === null && id.startsWith(localPrefix))
          ) {
            if (store === 'client') {
              for (const field of Object.keys(this.client[type][id] || {})) {
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
                this.combined[type][id] = keysToObject(
                  Object.keys(this.server[type][id]),
                  field => this.server[type][id][field],
                );
              } else {
                delete this.combined[type][id];
              }
              delete this.diff[type][id];
            }
          } else if (data[type][id] === null) {
            if (store === 'client') {
              for (const field of Object.keys(this.combined[type][id] || {})) {
                setChanged(type, id, field);
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
                this.combined[type][id] = keysToObject(
                  Object.keys(this.client[type][id]!).filter(
                    field => this.client[type][id]![field] !== null,
                  ),
                  field => this.client[type][id]![field]!,
                );
                this.diff[type][id] = 0;
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
                if (data[type][id]![field] === undefined) {
                  delete this.client[type][id]![field];
                  if (noUndef(_.get(this.server, [type, id, field])) !== null) {
                    this.combined[type][id]![field] = this.server[type][id][
                      field
                    ]!;
                  } else {
                    delete this.combined[type][id]![field];
                  }
                } else {
                  this.client[type][id]![field] = data[type][id]![field]!;
                  if (data[type][id]![field] === null) {
                    delete this.combined[type][id]![field];
                  } else {
                    this.combined[type][id]![field] = data[type][id]![field]!;
                  }
                }
              } else {
                const f = schema![type][field];
                const fieldValue =
                  fieldIs.scalar(f) && f.scalar === 'date'
                    ? mapArray(data[type][id]![field], decodeDate)
                    : data[type][id]![field];
                if (
                  fieldIs.relation(f) &&
                  f.isList &&
                  typeof (fieldValue && fieldValue[0]) === 'number'
                ) {
                  fieldValue.unshift(...new Array(fieldValue.shift()));
                }
                const clientClear =
                  _.get(this.client, [type, id]) !== null &&
                  _.get(this.client, [type, id, field]) === undefined;
                if (fieldValue === null) {
                  if (clientClear) delete this.combined[type][id]![field];
                  delete this.server[type][id]![field];
                } else {
                  if (clientClear) this.combined[type][id]![field] = fieldValue;
                  this.server[type][id]![field] = fieldValue;
                }
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
            if (_.get(this.client, [type, id])) {
              if (Object.keys(_.get(this.client, [type, id])).length === 0) {
                delete this.diff[type][id];
              } else {
                this.diff[type][id] = id.startsWith(localPrefix) ? 1 : 0;
              }
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
    const changes = this.set(
      'client',
      values.reduce((res, v) => _.set(res, v.key, v.value), {}),
    );
    if (Object.keys(changes).length > 0) this.emitChanges(changes);
  }

  public setServer(
    data: Obj<Obj<Obj<FieldValue | null> | null>>,
    schema: Obj<Obj<Field>>,
  ) {
    this.emitChanges(this.set('server', data, schema));
  }
}
