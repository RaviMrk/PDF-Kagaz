const READER = 'reader/[id]';

type Route = { key: string; name: string; params?: object };

const readerId = (r: Route): unknown =>
  r.params && 'id' in r.params ? (r.params as { id: unknown }).id : undefined;

/**
 * Root stack routes after an incoming PDF resolved on /open: /open and the reader directly
 * under it (an earlier incoming or the user's own) are replaced by the new reader, and no other
 * reader of the same file is kept, so at most one incoming reader sits on the user's screens.
 */
export function incomingReaderRoutes<R extends Route>(
  routes: readonly R[],
  openKey: string,
  id: string,
): (R | { name: typeof READER; params: { id: string } })[] {
  const rest = routes.filter((r) => r.key !== openKey);
  const last = rest.length - 1;
  const kept = rest.filter((r, i) => r.name !== READER || (i !== last && readerId(r) !== id));
  return [...kept, { name: READER, params: { id } }];
}
