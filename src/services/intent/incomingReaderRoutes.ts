const READER = 'reader/[id]';

type Route = { key: string; name: string; params?: object };

const readerId = (r: Route): unknown =>
  r.params && 'id' in r.params ? (r.params as { id: unknown }).id : undefined;

/**
 * Root stack routes after an incoming PDF resolved on /open. The new reader takes the place of
 * that /open; the reader directly under it (an earlier incoming or the user's own) and any reader
 * above it are dropped, as is any other reader of the same file. A later /open still in flight
 * stays above, so it can replace this reader in turn: at most one incoming reader remains.
 */
export function incomingReaderRoutes<R extends Route>(
  routes: readonly R[],
  openKey: string,
  id: string,
): (R | { name: typeof READER; params: { id: string } })[] {
  const at = routes.findIndex((r) => r.key === openKey);
  const below = at === -1 ? routes : routes.slice(0, at);
  const above = at === -1 ? [] : routes.slice(at + 1);
  const isReader = (r: R) => r.name === READER;
  const keptBelow = below.filter(
    (r, i) => !isReader(r) || (i !== below.length - 1 && readerId(r) !== id),
  );
  return [...keptBelow, { name: READER, params: { id } }, ...above.filter((r) => !isReader(r))];
}
