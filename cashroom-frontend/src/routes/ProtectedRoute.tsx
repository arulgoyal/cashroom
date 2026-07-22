import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getAccessToken } from '../auth/tokenStore';

/**
 * Guards a route in the browser: no access token → redirect to /signin. This is
 * a UX gate, NOT security — the real enforcement is the BFF/backend rejecting the
 * request without a valid token. A user could edit localStorage, but they still
 * can't call /user/me without a token the server accepts.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  if (getAccessToken() === null) {
    return <Navigate to="/signin" replace />;
  }
  return <>{children}</>;
}
