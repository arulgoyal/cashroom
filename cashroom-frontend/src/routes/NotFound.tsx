import { Link, useLocation } from 'react-router-dom';

export function NotFound() {
  const location = useLocation();
  return (
    <div>
      <h1>404 — no client route for {location.pathname}</h1>
      <div className="doc">
        This 404 is rendered BY REACT (client-side routing), not by a server.
        {'\n'}When you host a SPA, the static server must return{' '}
        <b>index.html for ALL paths</b> (the <b>* fallback</b>) so this router can
        boot and decide what to show. Without it, a hard refresh on a deep link
        like /dashboard would 404 at the server before React ever loads.
      </div>
      <Link to="/">→ home</Link>
    </div>
  );
}
