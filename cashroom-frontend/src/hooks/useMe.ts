import { useQuery } from '@tanstack/react-query';
import { ApiError, fetchJson } from '../api/client';
import { getAccessToken } from '../auth/tokenStore';
import type { SafeUser } from '../api/types';

/**
 * useMe — a React Query QUERY (a cacheable read of server state). It sends the
 * Bearer token; `enabled` gates it so it doesn't fire without one. React Query
 * caches the result under ['me'], dedupes concurrent callers, and exposes
 * isLoading/isError/data. `retry:false` so an expired token surfaces the 401
 * immediately instead of being retried.
 */
export function useMe() {
  return useQuery<SafeUser, ApiError>({
    queryKey: ['me'],
    queryFn: () => fetchJson<SafeUser>('/user/me', { auth: true }),
    enabled: getAccessToken() !== null,
    retry: false,
  });
}
