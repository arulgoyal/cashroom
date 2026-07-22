import { useNavigate } from 'react-router-dom';
import { useMe } from '../hooks/useMe';
import { useRefresh } from '../hooks/useRefresh';
import { clearTokens } from '../auth/tokenStore';
import { ErrorBox, StatusBadge } from '../components/ui';

export function Dashboard() {
  const navigate = useNavigate();
  const me = useMe();
  const refresh = useRefresh();

  const signOut = () => {
    clearTokens();
    navigate('/signin');
  };

  return (
    <div>
      <h1>GET /user/me</h1>
      <div className="doc">
        Protected route. Sends <b>Authorization: Bearer &lt;accessToken&gt;</b>{' '}
        (from the Token Vault). The BFF verifies the JWT, forwards to the backend,
        which re-verifies and returns the current <b>SafeUser</b>.
        {'\n'}No token → you'd have been redirected to /signin. Expired token → 401;
        use "refresh token & retry".
      </div>

      <div style={{ margin: '12px 0' }}>
        me: <StatusBadge status={me.status} />{' '}
        <span className="muted">{me.fetchStatus}</span>
      </div>

      {me.isLoading && <div className="muted">loading…</div>}

      {me.isError && (
        <>
          <ErrorBox error={me.error} />
          {me.error.status === 401 && (
            <button
              onClick={() =>
                refresh.mutate(undefined, { onSuccess: () => void me.refetch() })
              }
              disabled={refresh.isPending}
              style={{ marginTop: 8 }}
            >
              {refresh.isPending ? 'refreshing…' : 'refresh token & retry'}
            </button>
          )}
        </>
      )}

      {me.isSuccess && (
        <table className="kv">
          <tbody>
            <tr>
              <td className="k">id</td>
              <td>{me.data.id}</td>
            </tr>
            <tr>
              <td className="k">email</td>
              <td>{me.data.email}</td>
            </tr>
            <tr>
              <td className="k">role</td>
              <td>{me.data.role}</td>
            </tr>
            <tr>
              <td className="k">isEmailVerified</td>
              <td>{String(me.data.isEmailVerified)}</td>
            </tr>
            <tr>
              <td className="k">createdAt</td>
              <td>{me.data.createdAt}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button onClick={() => void me.refetch()}>refetch /user/me</button>
        <button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          refresh token
        </button>
        <button onClick={signOut}>sign out</button>
      </div>
      {refresh.isError && <ErrorBox error={refresh.error} />}
    </div>
  );
}
