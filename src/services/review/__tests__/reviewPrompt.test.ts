import { createMemoryStore } from '@/services/prefs/memoryStore';
import type { ToolOutcome } from '@/services/tools/runTool';

import { REVIEW_AFTER_SUCCESSES, createReviewPrompt } from '../reviewPrompt';

const OK: ToolOutcome = { ok: true, outputs: [] };
const FAILED: ToolOutcome = { ok: false, failure: 'interrupted', inputIndex: null, outputs: [] };

function setup(available = true) {
  const kv = createMemoryStore();
  const storeReview = {
    isAvailableAsync: jest.fn(async () => available),
    requestReview: jest.fn(async () => {}),
  };
  const make = () => createReviewPrompt({ kv, storeReview, now: () => 1234 });
  return { kv, storeReview, make, prompt: make() };
}

describe('reviewPrompt', () => {
  it('asks after the third successful job only', () => {
    const { prompt } = setup();
    expect(REVIEW_AFTER_SUCCESSES).toBe(3);
    prompt.recordOutcome(OK);
    prompt.recordOutcome(OK);
    expect(prompt.shouldAsk()).toBe(false);
    prompt.recordOutcome(FAILED);
    expect(prompt.shouldAsk()).toBe(false);
    prompt.recordOutcome(OK);
    expect(prompt.shouldAsk()).toBe(true);
  });

  it('stores askedAt before requesting, then never asks again', async () => {
    const { prompt, kv, storeReview, make } = setup();
    for (let i = 0; i < 3; i++) prompt.recordOutcome(OK);
    let storedAtRequest: number | undefined;
    storeReview.requestReview.mockImplementation(async () => {
      storedAtRequest = kv.getNumber('review.askedAt');
    });
    await prompt.ask();
    expect(storedAtRequest).toBe(1234);
    expect(storeReview.requestReview).toHaveBeenCalledTimes(1);
    expect(prompt.shouldAsk()).toBe(false);
    prompt.recordOutcome(OK);
    expect(prompt.shouldAsk()).toBe(false);
    expect(make().shouldAsk()).toBe(false);
  });

  it('keeps asking later when the review API is unavailable', async () => {
    const { prompt, kv, storeReview } = setup(false);
    for (let i = 0; i < 3; i++) prompt.recordOutcome(OK);
    await prompt.ask();
    expect(storeReview.requestReview).not.toHaveBeenCalled();
    expect(kv.getNumber('review.askedAt')).toBeUndefined();
    expect(prompt.shouldAsk()).toBe(true);
  });

  it('swallows a rejected request', async () => {
    const { prompt, storeReview } = setup();
    storeReview.requestReview.mockRejectedValue(new Error('x'));
    for (let i = 0; i < 3; i++) prompt.recordOutcome(OK);
    await expect(prompt.ask()).resolves.toBeUndefined();
    expect(prompt.shouldAsk()).toBe(false);
  });
});
