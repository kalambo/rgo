import { Query as QueryBase } from './core';

export { default as buildClient, Client, ClientPlugin } from './client';
export { default as buildServer, ServerPlugin, sources } from './server';

export type Query = QueryBase<string>;
