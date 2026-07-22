import { Link } from 'react-router-dom';

export function Home() {
  return (
    <div>
      <h1>cashroom // glass box</h1>
      <div className="doc">
        A developer console for the Cashroom auth stack — <b>not</b> a product UI.
        {'\n'}Every page states the exact request it fires. The right rail is the
        live wire:
        {'\n'} • <b>Request Log</b> — every HTTP call + raw req/resp + X-Request-ID
        {'\n'} • <b>Query State</b> — React Query's idle→pending→success/error machine
        {'\n'} • <b>Token Vault</b> — your JWT in localStorage, decoded
      </div>

      <h2>the path a request takes</h2>
      <pre>
{`  [browser]  this app, :5173
     |  fetch (CORS)
     v
  [BFF]  :3001   verify JWT · rate-limit · log · stamp X-Request-ID
     |  proxy
     v
  [backend] :3000  re-verify JWT · business logic
     |
     v
  [postgres] / [redis]`}
      </pre>

      <h2>start</h2>
      <p>
        <Link to="/signup">→ /signup</Link> — create an account, watch it
        auto-signin.
      </p>
      <p>
        <Link to="/signin">→ /signin</Link> — exchange credentials for a JWT.
      </p>
      <p>
        <Link to="/dashboard">→ /dashboard</Link> — protected; calls GET /user/me
        with the token.
      </p>
    </div>
  );
}
