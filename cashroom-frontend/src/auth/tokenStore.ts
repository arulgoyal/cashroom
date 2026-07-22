import type { TokenPair } from '../api/types';

/**
 * Token storage — localStorage.
 * ─────────────────────────────
 * WHY localStorage: it matches the BFF's stateless Bearer design (we send
 * `Authorization: Bearer <token>` on each request) and survives reloads.
 *
 * THE TRADE-OFF (shown live in the Token Vault panel): localStorage is readable
 * by ANY JavaScript on this origin, so an XSS bug = token theft. The more secure
 * alternative is an httpOnly cookie (JS can't read it) — but that needs the BFF
 * to Set-Cookie and handle CSRF, which is a separate change. sessionStorage would
 * only differ by clearing on tab close (same XSS exposure).
 */
const ACCESS_KEY = 'cashroom.accessToken';
const REFRESH_KEY = 'cashroom.refreshToken';

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeTokens(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(pair: TokenPair): void {
  localStorage.setItem(ACCESS_KEY, pair.accessToken);
  localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  emit();
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  emit();
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/**
 * Decode (NOT verify) a JWT for display. A JWT is base64url(header).base64url(
 * payload).signature — anyone can read the first two parts, which is the whole
 * point of showing it: the token is NOT encrypted, only signed. We never verify
 * here; the BFF/backend do that.
 */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>,
      payload: JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

function base64UrlDecode(segment: string): string {
  const b64 = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=');
  return atob(b64);
}
