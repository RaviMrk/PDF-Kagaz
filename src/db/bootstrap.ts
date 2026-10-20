export type RawConnection = {
  exec: (sql: string) => void;
  all: (sql: string) => unknown[];
};

/**
 * Post-open startup order: migrations first, foreign keys after.
 * SQLite ignores `PRAGMA foreign_keys` inside a transaction, so drizzle's
 * transactional migrations cannot switch FKs off for a table rebuild; DROP TABLE
 * would then fire ON DELETE CASCADE and silently wipe child rows.
 */
export async function finishStartup(
  conn: RawConnection,
  runMigrations: () => void | Promise<void>,
): Promise<void> {
  await runMigrations();
  conn.exec('PRAGMA foreign_keys = ON');
  const violations = conn.all('PRAGMA foreign_key_check');
  if (violations.length > 0) {
    throw new Error(`Database foreign key check failed (${violations.length} violation(s))`);
  }
}
