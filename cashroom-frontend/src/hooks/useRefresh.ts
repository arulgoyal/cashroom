import { useMutation } from '@tanstack/react-query';
import { ApiError, fetchJson } from '../api/client';
import { getRefreshToken, setTokens } from '../auth/tokenStore';
import type { TokenPair } from '../api/types';

/**
 * useRefresh — exchanges the stored refresh token for a NEW pair (rotation) and
 * saves it. The backend rejects a reused/rotated refresh token, so this only
 * works with the current one. We expose it as a manual button on the dashboard;
 * a production app would run this automatically on a 401 (silent refresh).
 */
export function useRefresh() {
  return useMutation<TokenPair, ApiError, void>({
    mutationKey: ['refresh'],
    mutationFn: async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        throw new ApiError(0, 'No refresh token stored — sign in again.');
      }
      return fetchJson<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
      });
    },
    onSuccess: (tokens) => setTokens(tokens),
  });
}
