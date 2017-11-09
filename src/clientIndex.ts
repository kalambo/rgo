import { Query as QueryBase } from './core';

export { default as buildClient, Client, ClientPlugin } from './client';

export type Query = QueryBase<string>;
