import * as StoreReview from 'expo-store-review';

import { mmkvStore } from '@/services/prefs/mmkvStore';
import type { KeyValueStore } from '@/services/prefs/KeyValueStore';
import type { ToolOutcome } from '@/services/tools/runTool';

export const REVIEW_AFTER_SUCCESSES = 3;

const SUCCESSES_KEY = 'review.successes';
const ASKED_AT_KEY = 'review.askedAt';

export type ReviewPromptDeps = {
  kv: KeyValueStore;
  storeReview: { isAvailableAsync(): Promise<boolean>; requestReview(): Promise<void> };
  now: () => number;
};

export type ReviewPrompt = {
  recordOutcome(outcome: ToolOutcome): void;
  shouldAsk(): boolean;
  ask(): Promise<void>;
};

/** Asks for a store review once per install, after the third successful tool job (A-05). */
export function createReviewPrompt({ kv, storeReview, now }: ReviewPromptDeps): ReviewPrompt {
  const shouldAsk = () =>
    (kv.getNumber(SUCCESSES_KEY) ?? 0) >= REVIEW_AFTER_SUCCESSES &&
    kv.getNumber(ASKED_AT_KEY) === undefined;
  return {
    recordOutcome(outcome) {
      if (!outcome.ok) return;
      try {
        kv.set(SUCCESSES_KEY, (kv.getNumber(SUCCESSES_KEY) ?? 0) + 1);
      } catch {
        // A counter that cannot be saved only delays the ask.
      }
    },
    shouldAsk,
    async ask() {
      try {
        if (!(await storeReview.isAvailableAsync())) return;
        // Stored first: a crash or a rejection never leads to a second prompt.
        kv.set(ASKED_AT_KEY, now());
        await storeReview.requestReview();
      } catch {
        // The review prompt never affects the user's flow.
      }
    },
  };
}

export const reviewPrompt = createReviewPrompt({
  kv: mmkvStore,
  storeReview: StoreReview,
  now: Date.now,
});
