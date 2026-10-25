import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { pdfNative, type PdfNativeApi } from '@/services/native/pdfNative';
import type { KeyValueStore } from '@/services/prefs/KeyValueStore';
import { mmkvStore } from '@/services/prefs/mmkvStore';
import type { Translate } from '@/services/tools/outputNames';
import type { ToolOutcome } from '@/services/tools/runTool';
import { toolById, type RunnableToolId } from '@/services/tools/toolRegistry';

/** Set once the notification permission was asked for (it is asked at most once per install). */
export const NOTIFICATIONS_ASKED_KEY = 'notifications.asked';

/** Android 13 (API 33): POST_NOTIFICATIONS is a runtime permission from here on. */
const NOTIFICATION_PERMISSION_API = 33;

export type JobNoticeDeps = {
  native: Pick<
    PdfNativeApi,
    'startJobNotice' | 'updateJobNotice' | 'stopJobNotice' | 'postJobDoneNotice'
  >;
  kv: KeyValueStore;
  androidVersion: number;
  requestNotificationPermission: () => Promise<unknown>;
  checkNotificationPermission: () => Promise<boolean>;
  isAppActive: () => boolean;
};

/** What the tool job store tells the background notice; none of these ever throws. */
export type JobNoticeHooks = {
  started(jobId: string, toolId: RunnableToolId, t: Translate): void;
  progress(jobId: string, fraction: number): void;
  finished(jobId: string, toolId: RunnableToolId, outcome: ToolOutcome, t: Translate): void;
};

/** Runs `fn` (sync or async) so that neither a throw nor a rejection escapes. */
function safely(fn: () => Promise<unknown> | unknown): void {
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // A notice never affects the job.
  }
}

/**
 * Background notice of tool jobs: a foreground service with a progress notification while a job
 * runs, and one "finished" notification when a job ends while the app is not active. The
 * notification permission is asked once, at the first job on Android 13+; denial changes nothing
 * else.
 */
export function createJobNotice(deps: JobNoticeDeps): JobNoticeHooks {
  async function askOnce(): Promise<void> {
    if (deps.androidVersion < NOTIFICATION_PERMISSION_API) return;
    if (deps.kv.getBoolean(NOTIFICATIONS_ASKED_KEY)) return;
    if (await deps.checkNotificationPermission()) return;
    if (deps.kv.getBoolean(NOTIFICATIONS_ASKED_KEY)) return;
    deps.kv.set(NOTIFICATIONS_ASKED_KEY, true);
    safely(() => deps.requestNotificationPermission());
  }

  const toolName = (toolId: RunnableToolId, t: Translate) => {
    const def = toolById(toolId);
    return def ? t(def.labelKey) : toolId;
  };

  return {
    started(jobId, toolId, t) {
      safely(() =>
        deps.native.startJobNotice(jobId, {
          title: t(`progress.title.${toolId}`),
          cancelLabel: t('progress.cancel'),
          channelName: t('notice.channel'),
        }),
      );
      safely(askOnce);
    },

    progress(jobId, fraction) {
      safely(() => deps.native.updateJobNotice(jobId, fraction));
    },

    finished(jobId, toolId, outcome, t) {
      safely(async () => {
        try {
          await deps.native.stopJobNotice(jobId);
        } catch {
          // The service stops with the task at the latest.
        }
        if (deps.isAppActive()) return;
        if (!outcome.ok && outcome.failure === 'cancelled') return;
        const tool = toolName(toolId, t);
        await deps.native.postJobDoneNotice(
          jobId,
          t(outcome.ok ? 'notice.done' : 'notice.failed', { tool }),
          t('notice.tapToView'),
          t('notice.doneChannel'),
        );
      });
    },
  };
}

const POST_NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS' as const;

/** The app's notice: PermissionsAndroid, the running Android version, AppState and MMKV. */
export const jobNotice: JobNoticeHooks = createJobNotice({
  native: pdfNative,
  kv: mmkvStore,
  androidVersion: typeof Platform.Version === 'number' ? Platform.Version : 0,
  requestNotificationPermission: () => PermissionsAndroid.request(POST_NOTIFICATIONS),
  checkNotificationPermission: () => PermissionsAndroid.check(POST_NOTIFICATIONS),
  isAppActive: () => AppState.currentState === 'active',
});
