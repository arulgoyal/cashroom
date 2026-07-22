import { useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, useEffect, useReducer } from 'react';

/**
 * Surfaces React Query's internal state machine so you can WATCH it: every query
 * and mutation with its status (idle → pending → success | error). This is the
 * thing React Query manages for you instead of hand-rolled isLoading flags.
 */
export function QueryState() {
  const qc = useQueryClient();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const unsubQueries = qc.getQueryCache().subscribe(force);
    const unsubMutations = qc.getMutationCache().subscribe(force);
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc, force]);

  const queries = qc.getQueryCache().getAll();
  const mutations = qc.getMutationCache().getAll();

  return (
    <section className="panel">
      <h3>React Query State</h3>
      <div className="body">
        <div className="muted">queries</div>
        {queries.length === 0 && <div className="muted">— none —</div>}
        {queries.map((q) => (
          <div key={q.queryHash} className="line" style={rowStyle}>
            <Badge status={q.state.status} />
            <span>{JSON.stringify(q.queryKey)}</span>
            <span className="muted">{q.state.fetchStatus}</span>
          </div>
        ))}

        <div className="muted" style={{ marginTop: 10 }}>
          mutations
        </div>
        {mutations.length === 0 && <div className="muted">— none —</div>}
        {mutations.map((m) => (
          <div key={m.mutationId} className="line" style={rowStyle}>
            <Badge status={m.state.status} />
            <span>
              {m.options.mutationKey
                ? JSON.stringify(m.options.mutationKey)
                : `#${m.mutationId}`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '2px 0',
};

function Badge({ status }: { status: string }) {
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
