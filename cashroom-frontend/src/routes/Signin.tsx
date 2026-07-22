import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignin } from '../hooks/useSignin';
import { type FieldErrors, hasErrors, validateSignin } from '../validation';
import { ErrorBox, Field, StatusBadge } from '../components/ui';

export function Signin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const signin = useSignin();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validateSignin({ email, password });
    setErrors(found);
    if (hasErrors(found)) return;
    signin.mutate({ email, password }, { onSuccess: () => navigate('/dashboard') });
  };

  return (
    <div>
      <h1>POST /auth/signin</h1>
      <div className="doc">
        Body <b>{'{ email, password }'}</b> → 200{' '}
        <b>{'{ accessToken, refreshToken }'}</b>. The hook stores the pair in
        localStorage (see the Token Vault) and we redirect to /dashboard.
        {'\n'}A wrong email OR password returns the SAME generic 401 — the server
        won't tell you which, to avoid leaking whether an email is registered.
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
        <button disabled={signin.isPending}>
          {signin.isPending ? 'signing in…' : 'signin → dashboard'}
        </button>
      </form>

      <div style={{ marginTop: 16 }}>
        <div>
          signin: <StatusBadge status={signin.status} />
        </div>
        {signin.isError && <ErrorBox error={signin.error} />}
      </div>
    </div>
  );
}
