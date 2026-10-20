import { AppState, type AppStateStatus } from 'react-native';

const TIMEOUT_MS = 120_000;

type AppStateLike = {
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void };
};

/** Resolves on the next 'active' change after a 'background'/'inactive', or after 120 s. */
export function waitForForeground(appState: AppStateLike = AppState): Promise<void> {
  return new Promise<void>((resolve) => {
    let left = false;
    const finish = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = appState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') left = true;
      else if (state === 'active' && left) finish();
    });
    const timer = setTimeout(finish, TIMEOUT_MS);
  });
}
