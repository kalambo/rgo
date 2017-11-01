import { Query as QueryBase } from './core';

export { default as buildClient, Client, clientPlugins } from './client';
export { ScalarName } from './core';
export { default as buildServer, connectors, serverPlugins } from './server';

export type Query = QueryBase<string>;
