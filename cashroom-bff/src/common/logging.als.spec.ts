import { getContext, runWithContext, setUserId } from './logging.als';

describe('BFF logging ALS', () => {
  it('exposes the context inside runWithContext', () => {
    runWithContext({ requestId: 'abc' }, () => {
      expect(getContext()?.requestId).toBe('abc');
    });
  });

  it('has no context outside a run', () => {
    expect(getContext()).toBeUndefined();
  });

  it('setUserId mutates the current context', () => {
    runWithContext({ requestId: 'x' }, () => {
      setUserId('user-1');
      expect(getContext()?.userId).toBe('user-1');
    });
  });

  it('isolates context across concurrent async runs', async () => {
    const capture = (id: string, delay: number) =>
      new Promise<string>((resolve) =>
        runWithContext({ requestId: id }, () => {
          setTimeout(() => resolve(getContext()?.requestId ?? '?'), delay);
        }),
      );
    const [a, b] = await Promise.all([capture('A', 10), capture('B', 5)]);
    expect(a).toBe('A');
    expect(b).toBe('B');
  });
});
