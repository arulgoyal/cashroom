import { useMutation } from '@tanstack/react-query';
import { ApiError, fetchJson } from '../api/client';
import type { SafeUser, SignupInput } from '../api/types';

/**
 * useSignup — a React Query MUTATION (a write, not a cacheable read).
 * The hook hands the component `mutate`, `isPending`, `isError`, `error`,
 * `isSuccess`, `data` — the loading/error/success state machine, for free.
 * Signup returns the SafeUser (NO token — see the Signup page for why we then
 * sign in).
 */
export function useSignup() {
  return useMutation<SafeUser, ApiError, SignupInput>({
    mutationKey: ['signup'],
    mutationFn: (input) =>
      fetchJson<SafeUser>('/auth/signup', { method: 'POST', body: input }),
  });
}
