import { Query as QueryBase } from './core';

export { default as buildClient, Client } from './client';
export { ScalarName } from './core';

export type Query = QueryBase<string>;
