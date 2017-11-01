import { mapFilterUser } from '../../core';

import { Plugin } from '../typings';

export interface AuthState {
  id: string;
  token: string;
  refresh?: string;
}

export default function auth(
  refresh?: (
    refreshToken: string,
  ) => Promise<{ token: string; refresh: string } | null>,
) {
  let state: AuthState | null = JSON.parse(
    localStorage.getItem('kalamboAuth') || 'null',
  );

  const setAuth = (newState: AuthState | null) => {
    const changed = (state && state.id) !== (newState && newState.id);
    if (!newState) localStorage.removeItem('kalamboAuth');
    else localStorage.setItem('kalamboAuth', JSON.stringify(newState));
    state = newState;
    return changed;
  };

  return {
    login(newState: AuthState) {
      setAuth(newState);
    },
    logout() {
      setAuth(null);
    },
    plugin: {
      async onFetch(body, headers, next, reset) {
        try {
          return await next(body, {
            ...headers,
            ...state ? { Authorization: `Bearer ${state.token}` } : {},
          });
        } catch {
          let newState: AuthState | null = null;
          if (refresh && state && state.refresh) {
            const newTokens = await refresh(state.refresh);
            if (newTokens) newState = { ...state, ...newTokens };
          }
          if (setAuth(newState)) reset();
          return await next(body, {
            ...headers,
            ...state ? { Authorization: `Bearer ${state.token}` } : {},
          });
        }
      },
      onFilter(filter) {
        return mapFilterUser(filter, state && state.id);
      },
    } as Plugin,
  };
}
