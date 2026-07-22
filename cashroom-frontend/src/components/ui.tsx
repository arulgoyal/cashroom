import type { ApiError } from '../api/client';

/** A labeled input with an inline validation error. */
export function Field({
  label,
  value,
  onChange,
  err,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  err?: string;
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {err && <div className="err">{err}</div>}
    </div>
  );
}

/** Renders the exact error envelope the BFF returned, including the requestId. */
export function ErrorBox({ error }: { error: ApiError }) {
  return (
    <div className="note" style={{ borderColor: 'var(--err)', color: 'var(--err)' }}>
      <div>
        ✖ {error.status || 'ERR'} — {error.message}
      </div>
      {error.requestId && (
        <div className="muted">
          requestId: {error.requestId} — grep this in the backend logs
        </div>
      )}
    </div>
  );
}

/** React Query status as a colored badge. */
export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'success'
      ? 'success'
      : status === 'error'
        ? 'error'
        : status === 'pending'
          ? 'pending'
          : 'idle';
  return <span className={`badge ${cls}`}>{status}</span>;
}
