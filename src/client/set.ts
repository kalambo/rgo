import * as _ from 'lodash';

import { Data, Obj } from '../core';

import { ClientState, DataChanges, DataDiff } from './typings';

(...x) => x as Obj;

const setDiff = (
  diff: DataDiff,
  type: string,
  id: string,
  value?: 1 | -1 | 0,
) => {
  diff[type] = diff[type] || {};
  if (value === undefined) delete diff[type][id];
  else diff[type][id] = value;
};

export function setClient(
  { server, client, combined, diff }: ClientState,
  args: any[],
) {
  const changes: DataChanges = {};
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
            client[type][id]![field] !==
            (server[type] && server[type][id] && server[type][id]![field])
          ) {
            setChanged(type, id, field);
          }
        }
      }
      delete client[type];
      if (server[type]) combined[type] = _.cloneDeep(server[type]);
      else delete combined[type];
      delete diff[type];
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
              client[type][id]![field] !==
              (server[type] && server[type][id] && server[type][id]![field])
            ) {
              setChanged(type, id, field);
            }
          }
          delete client[type][id];
          if (server[type] && server[type][id])
            combined[type][id] = _.cloneDeep(server[type][id]);
          else delete combined[type][id];
          setDiff(diff, type, id);
        } else if (
          (args.length < 3 && v2[id] === null) ||
          (args.length === 3 && v2 === null)
        ) {
          for (const field of Object.keys(combined[type][id] || {})) {
            if (combined[type][id] !== undefined) {
              setChanged(type, id, field);
            }
          }
          client[type][id] = null;
          delete combined[type][id];
          setDiff(diff, type, id, -1);
        } else {
          client[type][id] = client[type][id] || {};
          combined[type][id] = combined[type][id] || {};
          const v3 = args.length > 2 ? v2 : v2[id];
          const fields =
            args.length > 3 ? [args[2] as string] : Object.keys(v3);
          for (const field of fields) {
            const v4 = args.length > 3 ? v3 : v3[field];
            if (v4 === undefined) delete client[type][id]![field];
            else client[type][id]![field] = v4;
            if (v4 !== combined[type][id]![field]) {
              if (v4 === undefined) {
                if (
                  (server[type] &&
                    server[type][id] &&
                    server[type][id]![field]) !== undefined
                ) {
                  combined[type][id]![field] = server[type][id]![field];
                } else {
                  delete combined[type][id]![field];
                }
              } else {
                combined[type][id]![field] = v4;
              }
              setChanged(type, id, field);
            }
          }
          setDiff(diff, type, id, server[type] && server[type][id] ? 0 : 1);
        }
      }
    }
  }
  return changes;
}

export function setServer(
  { server, client, combined, diff }: ClientState,
  value: Data,
) {
  const changes: DataChanges = {};
  const setChanged = (type: string, id: string, field: string) => {
    changes[type] = changes[type] || {};
    changes[type][id] = changes[type][id] || {};
    changes[type][id][field] = true;
  };

  for (const type of Object.keys(value)) {
    server[type] = server[type] || {};
    combined[type] = combined[type] || {};
    for (const id of Object.keys(value[type])) {
      if (value[type][id] === null) {
        for (const field of Object.keys(combined[type][id] || {})) {
          if (
            combined[type][id]![field] !==
            (client[type] && client[type][id] && client[type][id]![field])
          ) {
            setChanged(type, id, field);
          }
        }
        delete server[type][id];
        if (client[type] && client[type][id])
          combined[type][id] = _.cloneDeep(client[type][id]);
        else delete combined[type][id];
        if (client[type] && client[type][id]) setDiff(diff, type, id, 1);
      } else {
        server[type][id] = server[type][id] || {};
        if ((client[type] && client[type][id]) !== null) {
          combined[type][id] = combined[type][id] || {};
        }
        for (const field of Object.keys(value[type][id])) {
          server[type][id]![field] = value[type][id]![field];
          if (
            (client[type] && client[type][id] && client[type][id]![field]) ===
            undefined
          ) {
            combined[type][id]![field] = value[type][id]![field];
            setChanged(type, id, field);
          }
        }
        if (client[type] && client[type][id]) setDiff(diff, type, id, 0);
      }
    }
  }
  return changes;
}
