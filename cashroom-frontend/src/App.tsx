import { Link, Route, Routes } from 'react-router-dom';
import { BFF_URL } from './api/client';
import { RequestLog } from './panels/RequestLog';
import { QueryState } from './panels/QueryState';
import { TokenVault } from './panels/TokenVault';
import { Home } from './routes/Home';
import { Signup } from './routes/Signup';
import { Signin } from './routes/Signin';
import { Dashboard } from './routes/Dashboard';
import { NotFound } from './routes/NotFound';
import { ProtectedRoute } from './routes/ProtectedRoute';

/**
 * The two-region shell: the app page (left) + the persistent instrumentation
 * rail (right). Routes are CLIENT-SIDE (React Router swaps views in-JS, no server
 * round-trip); the `*` route is the fallback for unknown paths.
 */
export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">cashroom//glass-box</span>
        <nav>
          <Link to="/">home</Link>
          <Link to="/signup">signup</Link>
          <Link to="/signin">signin</Link>
          <Link to="/dashboard">dashboard</Link>
        </nav>
        <span className="spacer" />
        <span className="muted">BFF → {BFF_URL}</span>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/signin" element={<Signin />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <aside className="rail">
        <RequestLog />
        <QueryState />
        <TokenVault />
      </aside>
    </div>
  );
}
