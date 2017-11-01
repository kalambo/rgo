import { Query as QueryBase } from './core';

export { default as buildClient, Client, ClientPlugin } from './client';
export { ScalarName } from './core';
export { default as buildServer, connectors, ServerPlugin } from './server';

export type Query = QueryBase<string>;
