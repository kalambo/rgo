import { Obj } from 'mishmash';
import * as _ from 'lodash';
import { DocumentNode, FieldNode, OperationDefinitionNode } from 'graphql';

import { Field } from '../core';

import runRelation from './runRelation';
import {
  buildArgs,
  Changes,
  createEmitter,
  createEmitterMap,
  Data,
  initKey,
} from './utils';

export default function createStore(
  schema: Obj<Obj<Field>>,
  initialData: Data = {},
) {
  const server = initialData;
  const client = {} as Data;
  const combined = initialData;

  const getEmitter = createEmitterMap();
  const readEmitter = createEmitter<Changes>();
  const emitChanges = (changes: Data<true>) => {
    const changedTypes = Object.keys(changes);
    if (changedTypes.length > 0) {
      for (const type of Object.keys(changes)) {
        const v1 = combined[type];
        getEmitter.emit(type, v1);
        for (const id of Object.keys(changes[type])) {
          const v2 = v1[id];
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

  function set(value: Data): void;
  function set(type: string, value: Obj<Obj>): void;
  function set(type: string, id: string, value: Obj): void;
  function set(type: string, id: string, field: string, value: any): void;
  function set(...args) {
    const changes: Data<true> = {};
    const v1 = args[args.length - 1];
    const types = args.length > 1 ? [args[0] as string] : Object.keys(v1);
    for (const type of types) {
      initKey(type, client, combined, changes);
      const v2 = args.length > 1 ? v1 : v1[type];
      const ids = args.length > 2 ? [args[1] as string] : Object.keys(v2);
      for (const id of ids) {
        initKey(id, client[type], combined[type], changes[type]);
        const v3 = args.length > 2 ? v2 : v2[id];
        const fields = args.length > 3 ? [args[2] as string] : Object.keys(v3);
        for (const field of fields) {
          const v4 = args.length > 3 ? v3 : v3[field];
          client[type][id][field] = v4;
          if (v4 !== combined[type][id][field]) {
            combined[type][id][field] = v4;
            changes[type][id][field] = true;
          }
        }
      }
    }
    emitChanges(changes);
  }

  function setServer(value: Data) {
    const changes: Data<true> = {};
    for (const type of Object.keys(value)) {
      initKey(type, server, combined, changes);
      for (const id of Object.keys(value[type])) {
        initKey(id, server[type], combined[type], changes[type]);
        for (const field of Object.keys(value[type][id])) {
          server[type][id][field] = value[type][id][field];
          if (
            (client[type] && client[type][id] && client[type][id][field]) ===
            undefined
          ) {
            combined[type][id][field] = value[type][id][field];
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
