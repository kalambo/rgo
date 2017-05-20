import { Obj } from 'mishmash';
import * as throttle from 'lodash/throttle';

import { Auth } from '../typings';

interface RequestItem {
  body: any;
  auth: Auth | null;
  resolve: (result: any) => void;
}

export default function batchFetch(url: string) {

  const doFetch = async (body: any, auth: Auth | null) => {

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth && auth.getToken() || ''}`
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401) {
        if (auth) auth.logout();
        return null;
      }
      throw new Error(response.statusText);
    }

    return await response.json() as Obj[];

  };

  let requestQueue: RequestItem[] = [];

  const processQueue = throttle(async () => {

    const batch = requestQueue;
    requestQueue = [];

    const results = await doFetch(batch.map(b => b.body), batch[batch.length - 1].auth);

    batch.forEach((b, i) => b.resolve(results && results[i]));

  }, 100, { leading: false });

  return async (body: any, auth: Auth | null) => {
    return await new Promise<Obj | null>(resolve => {
      requestQueue.push({ body, auth, resolve });
      processQueue();
    });
  };

}
