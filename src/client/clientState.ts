import * as _ from 'lodash';

import {
  Data,
  Field,
  fieldIs,
  keysToObject,
  mapArray,
  noUndef,
  Obj,
  scalars,
} from '../core';

import { DataChanges, DataDiff, FullChanges } from './typings';

export default class ClientState {
  private schema: Obj<Obj<Field>>;
  private log: boolean;
  private newIds: Obj<number>;

  public server: Data = {};
  public client: Data = {};
  public combined: Data = {};
  public diff: DataDiff = {};

  private listeners: ((value: FullChanges) => void)[] = [];
  private keyListeners: Obj<((value: any) => void)[]> = {};

  public constructor(schema: Obj<Obj<Field>>, log: boolean = false) {
    this.schema = schema;
    this.log = log;
    this.newIds = keysToObject(Object.keys(schema), () => 0);
  }

  public newId = (type: string) => `$${this.newIds[type]++}`;

  public watch(listener: (value: FullChanges) => void): () => void;
  public watch(key: string, listener: (value: any) => void): () => void;
  public watch(...args: any[]) {
    const listener = args[args.length - 1];
    const listeners =
      args.length === 1
        ? this.listeners
        : this.keyListeners[args[0]] || (this.keyListeners[args[0]] = []);
    listeners.push(listener);
    return args.length === 1
      ? () => (this.listeners = listeners.filter(l => l !== listener))
      : () =>
          (this.keyListeners[args[0]] = listeners.filter(l => l !== listener));
  }

  private emitChanges(changes: DataChanges, indices?: number[]) {
    if (this.log) {
      console.log(
        _.cloneDeep({
          server: this.server,
          client: this.client,
          combined: this.combined,
          diff: this.diff,
        }),
      );
    }
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        for (const id of Object.keys(changes[type])) {
          for (const field of Object.keys(changes[type][id])) {
            const value = noUndef(_.get(this.combined, [type, id, field]));
            (this.keyListeners[`${type}.${id}.${field}`] || [])
              .forEach(l => l(value));
          }
        }
      }
      const changedData = keysToObject(Object.keys(changes), type =>
        keysToObject(Object.keys(changes[type]), id =>
          keysToObject(Object.keys(changes[type][id]), field =>
            noUndef(_.get(this.combined, [type, id, field])),
          ),
        ),
      );
      this.listeners.forEach(l => l({ changes, changedData, indices }));
    }
  }

  private set(store: 'server' | 'client', data: Obj) {
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
              noUndef(_.get(this.combined, [type, id, field])) !==
              noUndef(_.get(this.server, [type, id, field]))
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
                noUndef(_.get(this.combined, [type, id, field])) !==
                noUndef(_.get(this.server, [type, id, field]))
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
                  noUndef(_.get(this.combined, [type, id, field])) !==
                  noUndef(_.get(this.client, [type, id, field]))
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
                const f = this.schema[type][field];
                const decode = fieldIs.scalar(f) && scalars[f.scalar].decode;
                const fieldValue =
                  data[type][id]![field] === null || !decode
                    ? data[type][id]![field]
                    : mapArray(data[type][id]![field], decode);
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
              if (noUndef(_.get(this.combined, [type, id, field])) !== prev) {
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

  public setClient(value: Obj<Obj<Obj | null | undefined> | undefined>): void;
  public setClient(
    type: string,
    value: Obj<Obj | null | undefined> | undefined,
  ): void;
  public setClient(
    type: string,
    id: string,
    value: Obj | null | undefined,
  ): void;
  public setClient(type: string, id: string, field: string, value: any): void;
  public setClient(...args: any[]) {
    this.emitChanges(
      this.set(
        'client',
        args
          .slice(0, -1)
          .reverse()
          .reduce((res, k) => ({ [k]: res }), args[args.length - 1]),
      ),
    );
  }

  public setServer(data: Data, indices: number[]) {
    this.emitChanges(this.set('server', data), indices);
  }
}
