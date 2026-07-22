import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignup } from '../hooks/useSignup';
import { useSignin } from '../hooks/useSignin';
import { type FieldErrors, hasErrors, validateSignup } from '../validation';
import { ErrorBox, Field, StatusBadge } from '../components/ui';

export function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const signup = useSignup();
  const signin = useSignin();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 1) CLIENT validation — instant, no network call for obvious mistakes.
    const found = validateSignup({ email, password, confirmPassword });
    setErrors(found);
    if (hasErrors(found)) return;

    // 2) POST /auth/signup → on success, chain POST /auth/signin (signup returns
    //    no token), store the pair, then go to the protected dashboard.
    signup.mutate(
      { email, password, confirmPassword },
      {
        onSuccess: () => {
          signin.mutate(
            { email, password },
            { onSuccess: () => navigate('/dashboard') },
          );
        },
      },
    );
  };

  const busy = signup.isPending || signin.isPending;

  return (
    <div>
      <h1>POST /auth/signup</h1>
      <div className="doc">
        Body <b>{'{ email, password, confirmPassword }'}</b> → 201{' '}
        <b>SafeUser</b> (no token!).
        {'\n'}Then this page auto-fires <b>POST /auth/signin</b> to exchange those
        credentials for a JWT, stores it, and redirects to /dashboard.
        {'\n'}Client validation runs first (instant), but the server re-validates —
        the client is attacker-controlled and can't be trusted.
      </div>

      <form onSubmit={submit}>
        <Field label="email" value={email} onChange={setEmail} err={errors.email} />
        <Field
          label="password"
          type="password"
          value={password}
          onChange={setPassword}
          err={errors.password}
        />
        <Field
          label="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          err={errors.confirmPassword}
        />
        <button disabled={busy}>
          {busy ? 'working…' : 'signup → signin → dashboard'}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <div>
          signup: <StatusBadge status={signup.status} /> &nbsp; signin:{' '}
          <StatusBadge status={signin.status} />
        </div>
        {signup.isError && <ErrorBox error={signup.error} />}
        {signin.isError && <ErrorBox error={signin.error} />}
        {signup.isSuccess && (
          <div className="ok" style={{ marginTop: 8 }}>
            ✓ account created: {signup.data.email} (role {signup.data.role}) —
            exchanging credentials for a token…
          </div>
        )}
      </div>
    </div>
  );
}
