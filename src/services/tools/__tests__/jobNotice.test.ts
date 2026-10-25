import { initI18n } from '@/i18n';
import { createMemoryStore } from '@/services/prefs/memoryStore';
import type { ToolOutcome } from '@/services/tools/runTool';
import { createFakePdfNative } from '@/test-utils/fakePdfNative';

import { createJobNotice, NOTIFICATIONS_ASKED_KEY } from '../jobNotice';

const t = initI18n('en').t;
const flush = () => new Promise((r) => setImmediate(r));
const success: ToolOutcome = { ok: true, outputs: [] };
const failed: ToolOutcome = { ok: false, failure: 'io', inputIndex: null, outputs: [] };
const cancelled: ToolOutcome = { ok: false, failure: 'cancelled', inputIndex: null, outputs: [] };

function setup(opts: { androidVersion?: number; granted?: boolean; active?: boolean } = {}) {
  const native = createFakePdfNative();
  const kv = createMemoryStore();
  const requestNotificationPermission = jest.fn(() => Promise.resolve('denied'));
  const checkNotificationPermission = jest.fn(() => Promise.resolve(opts.granted ?? false));
  let active = opts.active ?? true;
  const notice = createJobNotice({
    native,
    kv,
    androidVersion: opts.androidVersion ?? 34,
    requestNotificationPermission,
    checkNotificationPermission,
    isAppActive: () => active,
  });
  const setActive = (v: boolean) => {
    active = v;
  };
  return { native, kv, notice, requestNotificationPermission, setActive };
}

describe('jobNotice.started', () => {
  it('starts the notice and asks for the permission once on Android 13+', async () => {
    const s = setup();
    s.notice.started('lq2-a', 'compress', t);
    await flush();
    expect(s.native.startJobNotice).toHaveBeenCalledWith('lq2-a', {
      title: 'Compressing PDF',
      cancelLabel: 'Cancel',
      channelName: 'Tool progress',
    });
    expect(s.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(s.kv.getBoolean(NOTIFICATIONS_ASKED_KEY)).toBe(true);

    s.notice.started('lq2-b', 'merge', t);
    await flush();
    expect(s.native.startJobNotice).toHaveBeenCalledTimes(2);
    expect(s.requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('never asks below Android 13', async () => {
    const s = setup({ androidVersion: 32 });
    s.notice.started('lq2-a', 'compress', t);
    await flush();
    expect(s.native.startJobNotice).toHaveBeenCalledTimes(1);
    expect(s.requestNotificationPermission).not.toHaveBeenCalled();
    expect(s.kv.getBoolean(NOTIFICATIONS_ASKED_KEY)).toBeUndefined();
  });

  it('does not ask when the permission is already granted', async () => {
    const s = setup({ granted: true });
    s.notice.started('lq2-a', 'compress', t);
    await flush();
    expect(s.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('still starts the notice after the permission was denied', async () => {
    const s = setup();
    s.kv.set(NOTIFICATIONS_ASKED_KEY, true);
    s.notice.started('lq2-a', 'compress', t);
    await flush();
    expect(s.native.startJobNotice).toHaveBeenCalledTimes(1);
    expect(s.requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('never throws when the native start rejects or throws', async () => {
    const s = setup();
    s.native.startJobNotice.mockRejectedValueOnce(new Error('refused'));
    expect(() => s.notice.started('lq2-a', 'compress', t)).not.toThrow();
    s.native.startJobNotice.mockImplementationOnce(() => {
      throw new Error('gone');
    });
    expect(() => s.notice.started('lq2-b', 'compress', t)).not.toThrow();
    s.requestNotificationPermission.mockRejectedValueOnce(new Error('no activity'));
    await flush();
  });
});

describe('jobNotice.progress', () => {
  it('forwards the fraction and swallows errors', async () => {
    const s = setup();
    s.notice.progress('lq2-a', 0.4);
    expect(s.native.updateJobNotice).toHaveBeenCalledWith('lq2-a', 0.4);
    s.native.updateJobNotice.mockRejectedValueOnce(new Error('x'));
    expect(() => s.notice.progress('lq2-a', 0.5)).not.toThrow();
    await flush();
  });
});

describe('jobNotice.finished', () => {
  it('only stops the notice while the app is active', async () => {
    const s = setup({ active: true });
    s.notice.finished('lq2-a', 'compress', success, t);
    await flush();
    expect(s.native.stopJobNotice).toHaveBeenCalledWith('lq2-a');
    expect(s.native.postJobDoneNotice).not.toHaveBeenCalled();
  });

  it('posts a finished notice when the app is in the background', async () => {
    const s = setup({ active: false });
    s.notice.finished('lq2-a', 'compress', success, t);
    await flush();
    expect(s.native.stopJobNotice).toHaveBeenCalledWith('lq2-a');
    expect(s.native.postJobDoneNotice).toHaveBeenCalledWith(
      'lq2-a',
      'Compress finished',
      'Tap to see the result',
      'Finished tools',
    );
  });

  it("posts a couldn't-finish notice for a failure in the background", async () => {
    const s = setup({ active: false });
    s.notice.finished('lq2-a', 'merge', failed, t);
    await flush();
    expect(s.native.postJobDoneNotice).toHaveBeenCalledWith(
      'lq2-a',
      "Merge couldn't finish",
      'Tap to see the result',
      'Finished tools',
    );
  });

  it('posts nothing for a cancelled job', async () => {
    const s = setup({ active: false });
    s.notice.finished('lq2-a', 'compress', cancelled, t);
    await flush();
    expect(s.native.stopJobNotice).toHaveBeenCalledTimes(1);
    expect(s.native.postJobDoneNotice).not.toHaveBeenCalled();
  });

  it('still posts when stopping fails, and never throws', async () => {
    const s = setup({ active: false });
    s.native.stopJobNotice.mockRejectedValueOnce(new Error('x'));
    s.native.postJobDoneNotice.mockRejectedValueOnce(new Error('y'));
    expect(() => s.notice.finished('lq2-a', 'compress', success, t)).not.toThrow();
    await flush();
    expect(s.native.postJobDoneNotice).toHaveBeenCalledTimes(1);
  });
});
