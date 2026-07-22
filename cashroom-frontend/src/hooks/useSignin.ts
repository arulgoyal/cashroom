import { useMutation } from '@tanstack/react-query';
import { ApiError, fetchJson } from '../api/client';
import { setTokens } from '../auth/tokenStore';
import type { SigninInput, TokenPair } from '../api/types';

/**
 * useSignin — exchanges credentials for a token pair and stores it. `onSuccess`
 * runs after the mutation resolves; persisting the tokens here (rather than in
 * the component) keeps the "signin ⇒ tokens saved" rule in one place.
 */
export function useSignin() {
  return useMutation<TokenPair, ApiError, SigninInput>({
    mutationKey: ['signin'],
    mutationFn: (input) =>
      fetchJson<TokenPair>('/auth/signin', { method: 'POST', body: input }),
    onSuccess: (tokens) => setTokens(tokens),
  });
}
