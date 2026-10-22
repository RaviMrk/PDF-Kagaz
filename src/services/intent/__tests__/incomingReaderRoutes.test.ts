import { incomingReaderRoutes } from '../incomingReaderRoutes';

const r = (key: string, name: string, id?: string) => ({
  key,
  name,
  ...(id === undefined ? {} : { params: { id } }),
});
const reader = (id: string) => ({ name: 'reader/[id]', params: { id } });

describe('incomingReaderRoutes', () => {
  it('puts the reader in place of /open on the user screens', () => {
    expect(incomingReaderRoutes([r('t', '(tabs)'), r('o', 'open')], 'o', 'B')).toEqual([
      r('t', '(tabs)'),
      reader('B'),
    ]);
  });

  it('replaces the reader directly under /open', () => {
    const routes = [r('t', '(tabs)'), r('a', 'reader/[id]', 'A'), r('o', 'open')];
    expect(incomingReaderRoutes(routes, 'o', 'B')).toEqual([r('t', '(tabs)'), reader('B')]);
  });

  it('never keeps a second reader of the same file', () => {
    const routes = [r('t', '(tabs)'), r('a', 'reader/[id]', 'B'), r('s', 'scan'), r('o', 'open')];
    expect(incomingReaderRoutes(routes, 'o', 'B')).toEqual([
      r('t', '(tabs)'),
      r('s', 'scan'),
      reader('B'),
    ]);
  });

  it('works when /open is the only screen (cold start)', () => {
    expect(incomingReaderRoutes([r('o', 'open')], 'o', 'B')).toEqual([reader('B')]);
  });

  it('keeps a later /open still in flight above the new reader', () => {
    const routes = [r('t', '(tabs)'), r('o1', 'open'), r('o2', 'open')];
    expect(incomingReaderRoutes(routes, 'o1', 'A')).toEqual([
      r('t', '(tabs)'),
      reader('A'),
      r('o2', 'open'),
    ]);
  });

  it('then lets that /open replace the reader under it', () => {
    const routes = [r('t', '(tabs)'), r('ra', 'reader/[id]', 'A'), r('o2', 'open')];
    expect(incomingReaderRoutes(routes, 'o2', 'B')).toEqual([r('t', '(tabs)'), reader('B')]);
  });

  it('drops readers above the /open being resolved', () => {
    const routes = [r('t', '(tabs)'), r('o1', 'open'), r('rb', 'reader/[id]', 'B')];
    expect(incomingReaderRoutes(routes, 'o1', 'A')).toEqual([r('t', '(tabs)'), reader('A')]);
  });

  it('drops older pending opens below the one resolved', () => {
    const routes = [r('t', '(tabs)'), r('o1', 'open'), r('o2', 'open')];
    expect(incomingReaderRoutes(routes, 'o2', 'B')).toEqual([r('t', '(tabs)'), reader('B')]);
  });

  it('returns null when the open route is gone', () => {
    const routes = [r('t', '(tabs)'), r('ra', 'reader/[id]', 'A')];
    expect(incomingReaderRoutes(routes, 'o9', 'B')).toBeNull();
  });

  it('resolves in order o1 then o2', () => {
    const first = incomingReaderRoutes(
      [r('t', '(tabs)'), r('o1', 'open'), r('o2', 'open')],
      'o1',
      'A',
    );
    expect(first).toEqual([r('t', '(tabs)'), reader('A'), r('o2', 'open')]);
    const next = [r('t', '(tabs)'), r('ra', 'reader/[id]', 'A'), r('o2', 'open')];
    expect(incomingReaderRoutes(next, 'o2', 'B')).toEqual([r('t', '(tabs)'), reader('B')]);
  });

  it('resolves in order o2 then o1', () => {
    const first = incomingReaderRoutes(
      [r('t', '(tabs)'), r('o1', 'open'), r('o2', 'open')],
      'o2',
      'B',
    );
    expect(first).toEqual([r('t', '(tabs)'), reader('B')]);
    expect(
      incomingReaderRoutes([r('t', '(tabs)'), r('rb', 'reader/[id]', 'B')], 'o1', 'A'),
    ).toBeNull();
  });
});
