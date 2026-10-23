import { scrubErrorMessage } from './scrub';

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
};
type RejectionTrackerOptions = {
  allRejections: boolean;
  onUnhandled: (id: number, rejection: unknown) => void;
};
type HermesLike = { enablePromiseRejectionTracker?: (options: RejectionTrackerOptions) => void };

const FRAME = /^\s+at /;

/**
 * The error with its message (and the message line of its stack) scrubbed, in place so every
 * later handler — Crashlytics, React Native's fatal path and its native JavascriptException —
 * sees the scrubbed text. A non-Error becomes a scrubbed Error.
 */
export function scrubError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(scrubErrorMessage(error));
  const message = scrubErrorMessage(error.message);
  try {
    error.message = message;
    // The message may span lines; only the stack frames are kept after the new first line.
    const frames = (error.stack ?? '').split('\n').filter((line) => FRAME.test(line));
    error.stack = [`${error.name}: ${message}`, ...frames].join('\n');
    return error;
  } catch {
    return new Error(message);
  }
}

function safely(fn: () => void) {
  try {
    fn();
  } catch {
    // Reporting never adds a second failure.
  }
}

/**
 * Installs the outermost global error handler: every JS error is scrubbed before any other
 * handler sees it; non-fatal ones are recorded. Fatal ones reach the native crash report through
 * the previous handlers, already scrubbed. In release builds, unhandled promise rejections are
 * recorded (scrubbed) through Hermes' tracker; dev builds keep React Native's LogBox tracker.
 */
export type ErrorEnv = {
  errorUtils: ErrorUtilsLike | undefined;
  hermes: HermesLike | undefined;
  dev: boolean;
};

/** The app's real error environment. */
export function globalErrorEnv(): ErrorEnv {
  const g = globalThis as { ErrorUtils?: ErrorUtilsLike; HermesInternal?: HermesLike };
  return { errorUtils: g.ErrorUtils, hermes: g.HermesInternal, dev: __DEV__ };
}

export function installErrorScrubber({
  record,
  errorUtils,
  hermes,
  dev,
}: ErrorEnv & { record: (error: Error) => void }): void {
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      const clean = scrubError(error);
      if (!isFatal) safely(() => record(clean));
      previous(clean, isFatal);
    });
  }
  if (!dev) {
    safely(() =>
      hermes?.enablePromiseRejectionTracker?.({
        allRejections: true,
        onUnhandled: (_id, rejection) => safely(() => record(scrubError(rejection))),
      }),
    );
  }
}
