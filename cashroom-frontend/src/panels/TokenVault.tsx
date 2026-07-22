import { useEffect, useReducer } from 'react';
import {
  clearTokens,
  decodeJwt,
  getAccessToken,
  getRefreshToken,
  subscribeTokens,
} from '../auth/tokenStore';

/**
 * Makes the JWT tangible: what's in localStorage right now, DECODED (a JWT is
 * only base64url — signed, not encrypted, so its claims are readable), with a
 * live expiry countdown and the storage trade-off spelled out.
 */
export function TokenVault() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeTokens(force), [force]);
  // Re-render every second so the expiry countdown ticks.
  useEffect(() => {
    const id = setInterval(force, 1000);
    return () => clearInterval(id);
  }, [force]);

  const access = getAccessToken();
  const refresh = getRefreshToken();
  const decoded = access ? decodeJwt(access) : null;
  const exp =
    typeof decoded?.payload.exp === 'number' ? decoded.payload.exp : undefined;
  const expiresIn = exp !== undefined ? exp - Math.floor(Date.now() / 1000) : undefined;
  const expired = expiresIn !== undefined && expiresIn <= 0;

  return (
    <section className="panel">
      <h3>
        Token Vault <span className="muted">localStorage</span>
      </h3>
      <div className="body">
        {!access && (
          <div className="muted">no token stored. sign in to get one.</div>
        )}
        {access && decoded && (
          <>
            <table className="kv">
              <tbody>
                <tr>
                  <td className="k">stored at</td>
                  <td>localStorage['cashroom.accessToken']</td>
                </tr>
                <tr>
                  <td className="k">alg</td>
                  <td>{String(decoded.header.alg)}</td>
                </tr>
                <tr>
                  <td className="k">sub</td>
                  <td>{String(decoded.payload.sub)}</td>
                </tr>
                <tr>
                  <td className="k">email</td>
                  <td>{String(decoded.payload.email)}</td>
                </tr>
                <tr>
                  <td className="k">role</td>
                  <td>{String(decoded.payload.role)}</td>
                </tr>
                <tr>
                  <td className="k">expires in</td>
                  <td className={expired ? 'err' : 'ok'}>
                    {expiresIn !== undefined ? `${expiresIn}s` : '—'}
                    {expired ? ' (EXPIRED — refresh or re-signin)' : ''}
                  </td>
                </tr>
                <tr>
                  <td className="k">refresh token</td>
                  <td>{refresh ? 'present' : 'none'}</td>
                </tr>
              </tbody>
            </table>
            <div className="note">
              ⚠ In localStorage, any JS on this origin can read this token — an XSS
              bug means token theft. The secure alternative is an httpOnly cookie
              (JS can't read it), but that needs the BFF to Set-Cookie + handle CSRF.
            </div>
            <button onClick={() => clearTokens()} style={{ marginTop: 8 }}>
              clear tokens
            </button>
          </>
        )}
      </div>
    </section>
  );
}
