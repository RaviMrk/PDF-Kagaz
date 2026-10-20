import type { AppStateStatus } from 'react-native';

import { waitForForeground } from '../waitForForeground';

function fakeAppState() {
  let listener: (s: AppStateStatus) => void = () => {};
  const remove = jest.fn();
  return {
    emit: (s: AppStateStatus) => listener(s),
    remove,
    appState: {
      addEventListener: (_t: 'change', cb: (s: AppStateStatus) => void) => {
        listener = cb;
        return { remove };
      },
    },
  };
}

describe('waitForForeground', () => {
  afterEach(() => jest.useRealTimers());

  it('resolves on active after the app left the foreground', async () => {
    const f = fakeAppState();
    let done = false;
    const p = waitForForeground(f.appState).then(() => {
      done = true;
    });
    f.emit('active');
    await Promise.resolve();
    expect(done).toBe(false);
    f.emit('background');
    f.emit('active');
    await p;
    expect(done).toBe(true);
    expect(f.remove).toHaveBeenCalled();
  });

  it('resolves after 120 s', async () => {
    jest.useFakeTimers();
    const f = fakeAppState();
    const p = waitForForeground(f.appState);
    jest.advanceTimersByTime(120_000);
    await expect(p).resolves.toBeUndefined();
    expect(f.remove).toHaveBeenCalled();
  });
});
