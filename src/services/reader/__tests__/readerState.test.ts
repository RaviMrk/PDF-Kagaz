import { readerReducer, type ReaderPhase } from '../readerState';

describe('readerReducer', () => {
  it('walks the password flow to ready', () => {
    let s: ReaderPhase = { kind: 'preparing' };
    s = readerReducer(s, { type: 'prepared', fileUri: 'file:///a' });
    expect(s).toEqual({ kind: 'loading', fileUri: 'file:///a', password: '' });
    s = readerReducer(s, { type: 'pdfError', kind: 'password' });
    expect(s).toEqual({ kind: 'needsPassword', fileUri: 'file:///a', wrong: false });
    s = readerReducer(s, { type: 'submitPassword', password: 'nope' });
    expect(s).toEqual({ kind: 'loading', fileUri: 'file:///a', password: 'nope' });
    s = readerReducer(s, { type: 'pdfError', kind: 'password' });
    expect(s).toEqual({ kind: 'needsPassword', fileUri: 'file:///a', wrong: true });
    const same = readerReducer(s, { type: 'submitPassword', password: '' });
    expect(same).toBe(s);
    s = readerReducer(s, { type: 'submitPassword', password: 'secret' });
    s = readerReducer(s, { type: 'loaded', pageCount: 1 });
    expect(s).toEqual({ kind: 'ready', fileUri: 'file:///a', password: 'secret', pageCount: 1 });
  });

  it('fails on invalid and retries from failed', () => {
    const loading: ReaderPhase = { kind: 'loading', fileUri: 'file:///a', password: '' };
    const failed = readerReducer(loading, { type: 'pdfError', kind: 'invalid' });
    expect(failed).toEqual({ kind: 'failed', reason: 'invalid' });
    expect(readerReducer(failed, { type: 'retry' })).toEqual({ kind: 'preparing' });
  });

  it('records a prepare failure', () => {
    expect(
      readerReducer({ kind: 'preparing' }, { type: 'prepareFailed', reason: 'notFound' }),
    ).toEqual({
      kind: 'failed',
      reason: 'notFound',
    });
  });

  it('ignores events that do not apply', () => {
    const s: ReaderPhase = { kind: 'needsPassword', fileUri: 'file:///a', wrong: false };
    expect(readerReducer(s, { type: 'loaded', pageCount: 3 })).toBe(s);
    const p: ReaderPhase = { kind: 'preparing' };
    expect(readerReducer(p, { type: 'retry' })).toBe(p);
  });
});
