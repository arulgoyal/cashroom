# Spec: frontend-react-vite-glassbox

**Status:** in-progress
**Owner:** @arulgoyal
**Started:** 2026-07-20

## Goal
Create `cashroom-frontend` — a React + TypeScript + Vite SPA that is a **developer-
facing "glass box,"** not a consumer website. Utilitarian/monospace, terminal-IDE
aesthetic. Every page states the exact HTTP request it fires; a persistent
instrumentation rail shows a live **Request Log** (every call + raw req/resp +
X-Request-ID), a **Token Vault** (localStorage contents + decoded JWT claims +
expiry countdown + XSS explanation), and **Query State** (React Query's
idle/pending/success/error state machine). Wires the full auth slice: signup →
(auto) signin → protected `/dashboard` that calls `GET /user/me`. Talks only to the
BFF (`localhost:3001`). Added to docker-compose as a Vite dev-server container.

## Decisions
- [x] **Glass-box level = "top 1%, decide yourself"** (user) → the two-region shell
      + 3-panel instrumentation rail described above. Distinctive, self-documenting,
      dependency-light (no UI kit; one global monospace stylesheet + CSS vars).
- [x] **Compose = Vite dev-server container** (user): `vite --host 0.0.0.0` on 5173,
      source bind-mounted for HMR, HMR client port configured for Docker.
- [x] **Auth scope = signup + signin + protected dashboard** (user): ProtectedRoute;
      `/dashboard` calls `GET /user/me` with the Bearer token.
- [x] **Token storage = localStorage** (I decided, as delegated): matches the BFF's
      stateless Bearer design; the Token Vault panel EXPLAINS the XSS exposure and
      that httpOnly cookies are the prod upgrade (needs BFF Set-Cookie + CSRF). Keys
      `cashroom.accessToken` / `cashroom.refreshToken`; a tiny pub/sub so the panel
      updates live.
- [x] **Signup → dashboard via chained signin.** Signup returns a SafeUser, NOT
      tokens. So on signup success we auto-call signin with the same creds → store
      tokens → navigate to `/dashboard`. The UI makes this two-step explicit (a real
      teaching moment: "account created; now exchanging credentials for a token").
- [x] **Stack:** React 18, `react-router-dom` v6, `@tanstack/react-query` v5,
      `@tanstack/react-query-devtools`, Vitest + Testing Library. No Tailwind/MUI.
- [x] **One instrumented fetch wrapper** (`api/client.ts`) is the ONLY way calls are
      made — it records every request into the Request Log store and maps non-2xx to
      a typed `ApiError` (statusCode/message/requestId) rendered verbatim by pages.

## Concepts to teach (for the learning note / on-screen copy)
- **React mental model vs your HTTP-handler brain:** a component is a *pure-ish
  function `state → UI`* (like a handler mapping input → response), and it *re-runs*
  whenever its state/props change. Hooks (`useState`/`useQuery`) are how a function
  "remembers" across re-runs. Not request/response once — a continuously re-rendered
  view of state.
- **TypeScript on the frontend:** catches shape mismatches with the API at compile
  time (the SafeUser/TokenPair types ARE the contract), autocompletes props, and
  makes refactors safe — the payoff is bigger on the frontend because there are many
  more moving shapes (props, state, API responses, router params).
- **Vite vs CRA:** native ESM + esbuild dev server = near-instant start + true HMR;
  CRA (webpack, unmaintained) rebuilds the bundle. Prod build via Rollup.
- **Client-side vs server-side routing:** the SPA swaps views in-JS without a round
  trip (React Router intercepts navigation); the server only ever serves index.html.
  Hence the `*` fallback: a deep link like `/dashboard` must return index.html so the
  client router can take over — otherwise the static host 404s.
- **React Query vs raw fetch:** it owns server-state — caching, dedupe, loading/error
  states, retries, invalidation — so you stop hand-rolling `isLoading`/`useEffect`.
- **Validate client AND server:** client validation = fast UX (no round trip for
  obvious errors); server validation = the real security boundary (the client is
  attacker-controlled). Never trust the client.

## Files touched (new project `cashroom-frontend/`)
- scaffold: `index.html`, `vite.config.ts`, `tsconfig*.json`, `package.json`, `eslint.config.js`, `.gitignore`, `.dockerignore`, `.env`, `.env.example`
- `src/main.tsx` — QueryClientProvider + BrowserRouter + RQ Devtools
- `src/App.tsx` — the two-region shell + `<Routes>`; `*` → NotFound
- `src/routes/{Home,Signup,Signin,Dashboard,NotFound}.tsx`
- `src/routes/ProtectedRoute.tsx` — redirect to /signin when no token
- `src/api/client.ts` — instrumented `fetchJson` + `ApiError`
- `src/api/types.ts` — SafeUser, TokenPair, ApiErrorBody (mirror the BFF contract)
- `src/hooks/{useSignup,useSignin,useMe,useRefresh}.ts` — React Query mutations/query
- `src/auth/tokenStore.ts` — localStorage get/set/clear + pub/sub + JWT decode
- `src/instrumentation/requestLog.ts` — in-memory request-log store + subscribe
- `src/panels/{RequestLog,TokenVault,QueryState}.tsx` — the instrumentation rail
- `src/validation.ts` — pure client-side validators (email, password, match)
- `src/styles.css` — one monospace/terminal theme (CSS vars)
- tests: `validation.test.ts`, `tokenStore.test.ts`, `client.test.ts` (error mapping)
- `Dockerfile` (Vite dev), `README.md`

**Root:** `docker-compose.yml` (add `cashroom-frontend` service; bind-mount + HMR);
`.env.example` (note VITE_BFF_URL); `learning/10-frontend-react-vite-glassbox.md` (local).

## Validation
- **Unit (Vitest):** validators (valid/invalid email, short pw, mismatch); tokenStore
  set/get/clear + JWT decode of a known token; client.ts maps a non-2xx body to
  ApiError with requestId and records a Request Log entry.
- **Integration/manual (browser, full stack up):** `/signup` with client-invalid
  input → inline errors, no call fired; valid → 201 in Request Log → auto-signin →
  tokens appear in Token Vault (decoded, countdown) → redirect `/dashboard` →
  `GET /user/me` 200 renders SafeUser. `/dashboard` with no token → redirect
  `/signin`. Duplicate email → 409 envelope shown with requestId. Deep-link
  `/dashboard` reload served by Vite (SPA fallback). Sign out clears the vault.
- **Gates:** `npm run lint`, `tsc --noEmit`, `npm test` (vitest) green.

## Rollback
Fully additive. `git revert` removes `cashroom-frontend/` and the compose service.
No backend/BFF/schema changes (CORS already allows `http://localhost:5173`). Nothing
existing depends on the frontend.

## Risk: MEDIUM
New app + new stack (React/Vite/Router/RQ) and a dev-container with HMR networking,
but strictly additive and isolated behind port 5173; no changes to any existing
service. Trickiest bits: the chained signup→signin, the ProtectedRoute/refresh flow,
and Vite HMR through Docker.

## Known limitations (for the learning note)
1. **localStorage is XSS-exposed.** Any injected script on this origin can read the
   token. We accept it for this step and EXPLAIN it in the Token Vault; the prod
   fix is httpOnly cookies (BFF must Set-Cookie + handle CSRF) — out of scope.
2. **No automatic refresh interceptor.** On a 401 we surface it and offer a manual
   "refresh" button (calls /auth/refresh) rather than a silent retry queue.
3. **No design system / a11y polish** — deliberate; this is a dev instrument.
4. **requestId is shown but not click-through to backend logs** — the correlation is
   real (same id the backend logs), but there's no log-search integration here.
5. **Dev-server container only** (no prod static build/nginx this step).
