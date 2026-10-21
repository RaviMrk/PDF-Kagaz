import { incomingReaderRoutes } from '../incomingReaderRoutes';

const r = (key: string, name: string, id?: string) => ({
  key,
  name,
  ...(id === undefined ? {} : { params: { id } }),
});

describe('incomingReaderRoutes', () => {
  it('drops /open and pushes the reader on the user screens', () => {
    expect(incomingReaderRoutes([r('t', '(tabs)'), r('o', 'open')], 'o', 'B')).toEqual([
      r('t', '(tabs)'),
      { name: 'reader/[id]', params: { id: 'B' } },
    ]);
  });

  it('replaces the reader that was on top', () => {
    const routes = [r('t', '(tabs)'), r('a', 'reader/[id]', 'A'), r('o', 'open')];
    expect(incomingReaderRoutes(routes, 'o', 'B')).toEqual([
      r('t', '(tabs)'),
      { name: 'reader/[id]', params: { id: 'B' } },
    ]);
  });

  it('never keeps a second reader of the same file', () => {
    const routes = [r('t', '(tabs)'), r('a', 'reader/[id]', 'B'), r('s', 'scan'), r('o', 'open')];
    expect(incomingReaderRoutes(routes, 'o', 'B')).toEqual([
      r('t', '(tabs)'),
      r('s', 'scan'),
      { name: 'reader/[id]', params: { id: 'B' } },
    ]);
  });

  it('works when /open is the only screen (cold start)', () => {
    expect(incomingReaderRoutes([r('o', 'open')], 'o', 'B')).toEqual([
      { name: 'reader/[id]', params: { id: 'B' } },
    ]);
  });
});
