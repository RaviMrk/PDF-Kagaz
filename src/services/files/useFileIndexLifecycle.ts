import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useFiles } from '@/stores/filesStore';
import { useStorage } from '@/stores/storageStore';

/** Foreground quick rescans are skipped when the last scan finished less than this long ago. */
const QUICK_SCAN_MIN_INTERVAL_MS = 10_000;

/**
 * Index lifecycle: cached list first (F-03), a full scan on start, and on every return to the
 * foreground either a full scan (access mode changed) or a throttled quick scan (F-04).
 */
export function useFileIndexLifecycle(): void {
  useEffect(() => {
    let mounted = true;
    // Mode of the last scan this hook started; compared on foreground to detect mode switches.
    let scannedMode: string | null = null;

    const start = async () => {
      const mode = await useStorage.getState().refreshMode();
      if (!mounted) return;
      useFiles.getState().loadFromCache();
      scannedMode = mode;
      if (mode !== 'none') void useFiles.getState().refresh('full');
    };

    const onActive = async () => {
      const mode = await useStorage.getState().refreshMode();
      if (!mounted || mode === 'none') {
        scannedMode = mode;
        return;
      }
      const files = useFiles.getState();
      if (mode !== scannedMode) {
        scannedMode = mode;
        void files.refresh('full');
      } else if (
        files.lastScanAt == null ||
        Date.now() - files.lastScanAt >= QUICK_SCAN_MIN_INTERVAL_MS
      ) {
        void files.refresh('quick');
      }
    };

    void start().catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void onActive().catch(() => {});
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}
