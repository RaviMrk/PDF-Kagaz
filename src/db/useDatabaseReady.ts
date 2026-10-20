import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import { finishStartup } from '@/db/bootstrap';
import { getDb, getRawConnection } from '@/db/client';
import migrations from '@/db/migrations/migrations';

export type DatabaseState = { success: boolean; error?: Error };

/** Opens the database, runs migrations, then enables foreign keys; any failure becomes `error`. */
export function useDatabaseReady(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ success: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        await finishStartup(getRawConnection(), () => migrate(db, migrations));
        if (!cancelled) setState({ success: true });
      } catch (e) {
        if (!cancelled)
          setState({ success: false, error: e instanceof Error ? e : new Error(String(e)) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
