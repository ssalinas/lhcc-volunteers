import { createAuthClient } from 'better-auth/react';

// No baseURL: better-auth defaults to same-origin + /api/auth, which matches
// both the Vite dev proxy (vite.config.ts) and the single-process prod setup.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

export type SessionUser = NonNullable<ReturnType<typeof useSession>['data']>['user'] & {
  role: 'admin' | 'volunteer';
  active: boolean;
};
