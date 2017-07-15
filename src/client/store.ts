import { createEmitter, createEmitterMap, Obj } from 'mishmash';
import * as _ from 'lodash';
import { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

import { Data, Field } from '../core';

import runRelation from './runRelation';
import { buildArgs, Changes } from './utils';

export default function createStore(
  schema: Obj<Obj<Field>>,
  initial: { server?: Data; client?: Data } = {},
) {
  const server: Data = _.cloneDeep(initial.server || {});
  const client: Data = _.cloneDeep(initial.client || {});
  const combined: Data = _.merge({}, server, client);

  const getEmitter = createEmitterMap();
  const readEmitter = createEmitter<Changes>();
  const emitChanges = (changes: Data<true>) => {
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        const v1 = combined[type] || {};
        getEmitter.emit(type, v1);
        for (const id of Object.keys(changes[type])) {
          const v2 = v1[id] || {};
          getEmitter.emit(`${type}.${id}`, v2);
          for (const field of Object.keys(changes[type][id])) {
            const v3 = v2[field];
            getEmitter.emit(`${type}.${id}.${field}`, v3);
          }
        }
      }
      getEmitter.emit('', combined);
      readEmitter.emit({ changes, rootChanges: { added: [], removed: [] } });
    }
  };

  function get(): Data;
  function get(type: string): Obj<Obj>;
  function get(type: string, id: string): Obj;
  function get(type: string, id: string, field: string): any;
  function get(listener: (value: Data) => void): () => void;
  function get(type: string, listener: (value: Obj<Obj>) => void): () => void;
  function get(
    type: string,
    id: string,
    listener: (value: Obj) => void,
  ): () => void;
  function get(
    type: string,
    id: string,
    field: string,
    listener: (value: any) => void,
  ): () => void;
  function get(...args) {
    if (args.length === 0) return combined;
    if (typeof args[args.length - 1] === 'string') {
      return _.get(combined, args.join('.'));
    }
    const listener = args.pop();
    const key = args.join('.');
    listener(key ? _.get(combined, key) : combined);
    return getEmitter.watch(key, listener);
  }

  function read(
    queryDoc: DocumentNode,
    variables: Obj,
    userId: string | null,
  ): Obj;
  function read(
    queryDoc: DocumentNode,
    variables: Obj,
    userId: string | null,
    listener: (value: Obj) => void,
  ): () => void;
  function read(...args) {
    const [queryDoc, variables, userId, listener] = args as [
      DocumentNode,
      Obj,
      string | null,
      ((value: Obj) => void) | undefined
    ];
    const fieldNodes = (queryDoc.definitions[0] as OperationDefinitionNode)
      .selectionSet.selections as FieldNode[];
    const value = {};
    const stopRelations = fieldNodes.map(node =>
      runRelation(
        { field: node.name.value, records: { '': value } },
        { type: node.name.value, isList: true },
        buildArgs(node.arguments, variables),
        node.selectionSet!.selections as FieldNode[],
        {
          data: combined,
          schema,
          userId,
          variables,
        },
        listener && readEmitter.watch,
      ),
    );
    if (!listener) return value;
    listener(value);
    return () => stopRelations.forEach(s => s());
  }

  function set(value: Obj<Obj<Obj | undefined> | undefined>): void;
  function set(type: string, value: Obj<Obj | undefined> | undefined): void;
  function set(type: string, id: string, value: Obj | undefined): void;
  function set(type: string, id: string, field: string, value: any): void;
  function set(...args) {
    const changes: Data<true> = {};
    const setChanged = (type: string, id: string, field: string) => {
      changes[type] = changes[type] || {};
      changes[type][id] = changes[type][id] || {};
      changes[type][id][field] = true;
    };

    const v1 = args[args.length - 1];
    const types = args.length > 1 ? [args[0] as string] : Object.keys(v1);
    for (const type of types) {
      if (
        (args.length < 2 && v1[type] === undefined) ||
        (args.length === 2 && v1 === undefined)
      ) {
        for (const id of Object.keys(client[type] || {})) {
          for (const field of Object.keys(client[type][id] || {})) {
            if (
              client[type][id][field] !==
              ((server[type] || {})[id] || {})[field]
            ) {
              setChanged(type, id, field);
            }
          }
        }
        delete client[type];
        if (server[type]) combined[type] = _.cloneDeep(server[type]);
        else delete combined[type];
      } else {
        client[type] = client[type] || {};
        combined[type] = combined[type] || {};
        const v2 = args.length > 1 ? v1 : v1[type];
        const ids = args.length > 2 ? [args[1] as string] : Object.keys(v2);
        for (const id of ids) {
          if (
            (args.length < 3 && v2[id] === undefined) ||
            (args.length === 3 && v2 === undefined)
          ) {
            for (const field of Object.keys(client[type][id] || {})) {
              if (
                client[type][id][field] !==
                ((server[type] || {})[id] || {})[field]
              ) {
                setChanged(type, id, field);
              }
            }
            delete client[type][id];
            if ((server[type] || {})[id])
              combined[type][id] = _.cloneDeep(server[type][id]);
            else delete combined[type][id];
          } else {
            client[type][id] = client[type][id] || {};
            combined[type][id] = combined[type][id] || {};
            const v3 = args.length > 2 ? v2 : v2[id];
            const fields =
              args.length > 3 ? [args[2] as string] : Object.keys(v3);
            for (const field of fields) {
              const v4 = args.length > 3 ? v3 : v3[field];
              if (v4 === undefined) delete client[type][id][field];
              else client[type][id][field] = v4;
              if (v4 !== combined[type][id][field]) {
                if (v4 === undefined) {
                  if (((server[type] || {})[id] || {})[field] !== undefined) {
                    combined[type][id][field] = server[type][id][field];
                  } else {
                    delete combined[type][id][field];
                  }
                } else {
                  combined[type][id][field] = v4;
                }
                setChanged(type, id, field);
              }
            }
          }
        }
      }
    }
    emitChanges(changes);
  }

  function setServer(value: Data) {
    const changes: Data<true> = {};
    for (const type of Object.keys(value)) {
      server[type] = server[type] || {};
      combined[type] = combined[type] || {};
      for (const id of Object.keys(value[type])) {
        server[type][id] = server[type][id] || {};
        combined[type][id] = combined[type][id] || {};
        for (const field of Object.keys(value[type][id])) {
          server[type][id][field] = value[type][id][field];
          if (
            (client[type] && client[type][id] && client[type][id][field]) ===
            undefined
          ) {
            combined[type][id][field] = value[type][id][field];
            changes[type] = changes[type] || {};
            changes[type][id] = changes[type][id] || {};
            changes[type][id][field] = true;
          }
        }
      }
    }
    emitChanges(changes);
  }

  return {
    get,
    read,
    set,
    setServer,
  };
}
