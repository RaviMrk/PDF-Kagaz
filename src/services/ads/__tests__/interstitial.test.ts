import { AdEventType } from 'react-native-google-mobile-ads';

import { createMemoryStore } from '@/services/prefs/memoryStore';
import type { KeyValueStore } from '@/services/prefs/KeyValueStore';

import { createInterstitialController, type InterstitialLike } from '../interstitial';

const KEY = 'ads.lastInterstitialAt';

type FakeAd = InterstitialLike & { emit(type: string): void; show: jest.Mock; load: jest.Mock };

function fakeAd(): FakeAd {
  const listeners = new Map<string, () => void>();
  const ad = {
    loaded: false,
    load: jest.fn(),
    show: jest.fn(() => Promise.resolve()),
    addAdEventListener: jest.fn((type: string, cb: () => void) => {
      listeners.set(type, cb);
      return () => listeners.delete(type);
    }),
    emit(type: string) {
      if (type === AdEventType.LOADED) ad.loaded = true;
      listeners.get(type)?.();
    },
  };
  return ad as unknown as FakeAd;
}

function setup(opts: { kv?: KeyValueStore; canRequestAds?: boolean; now?: number } = {}) {
  const kv = opts.kv ?? createMemoryStore();
  const clock = { now: opts.now ?? 0 };
  const flags = { canRequestAds: opts.canRequestAds ?? true };
  const ads: FakeAd[] = [];
  const create = jest.fn(() => {
    const ad = fakeAd();
    ads.push(ad);
    return ad;
  });
  const controller = createInterstitialController({
    create,
    kv,
    now: () => clock.now,
    canRequestAds: () => flags.canRequestAds,
    unitId: 'unit',
  });
  return { controller, kv, clock, flags, ads, create };
}

describe('interstitial controller', () => {
  it('never creates an ad while consent does not allow ads', () => {
    const { controller, create } = setup({ canRequestAds: false });
    controller.preload();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates and loads once while an ad is loading or loaded', () => {
    const { controller, create, ads } = setup();
    controller.preload();
    controller.preload();
    expect(create).toHaveBeenCalledWith('unit');
    expect(create).toHaveBeenCalledTimes(1);
    expect(ads[0]!.load).toHaveBeenCalledTimes(1);
    ads[0]!.emit(AdEventType.LOADED);
    controller.preload();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('shows nothing, synchronously, when no ad is loaded', () => {
    const { controller, ads } = setup();
    expect(controller.showAfterDone()).toBe(false);
    controller.preload();
    expect(controller.showAfterDone()).toBe(false);
    expect(ads[0]!.show).not.toHaveBeenCalled();
  });

  it('shows a loaded ad, stores the time first, and drops the ad', () => {
    const { controller, ads, kv } = setup({ now: 0 });
    controller.preload();
    ads[0]!.emit(AdEventType.LOADED);
    ads[0]!.show.mockImplementation(() => {
      expect(kv.getNumber(KEY)).toBe(0);
      return Promise.resolve();
    });
    expect(controller.showAfterDone()).toBe(true);
    expect(kv.getNumber(KEY)).toBe(0);
    expect(ads[0]!.show).toHaveBeenCalledTimes(1);
    expect(controller.showAfterDone()).toBe(false);
  });

  it('enforces the cap with a second ad, across a restart, and releases it at 180 s', () => {
    const first = setup({ now: 0 });
    first.controller.preload();
    first.ads[0]!.emit(AdEventType.LOADED);
    expect(first.controller.showAfterDone()).toBe(true);

    first.clock.now = 179_999;
    first.controller.preload();
    first.ads[1]!.emit(AdEventType.LOADED);
    expect(first.controller.showAfterDone()).toBe(false);

    // A cold restart: a new controller on the same persisted store.
    const restarted = setup({ kv: first.kv, now: 100_000 });
    restarted.controller.preload();
    restarted.ads[0]!.emit(AdEventType.LOADED);
    expect(restarted.controller.showAfterDone()).toBe(false);

    restarted.clock.now = 180_000;
    expect(restarted.controller.showAfterDone()).toBe(true);
    expect(restarted.kv.getNumber(KEY)).toBe(180_000);
  });

  it('resets the stored time and shows nothing when the clock moved back', () => {
    const kv = createMemoryStore();
    kv.set(KEY, 500_000);
    const { controller, ads } = setup({ kv, now: 10 });
    controller.preload();
    ads[0]!.emit(AdEventType.LOADED);
    expect(controller.showAfterDone()).toBe(false);
    expect(kv.getNumber(KEY)).toBe(10);
    expect(ads[0]!.show).not.toHaveBeenCalled();
  });

  it('returns false when show throws, and never rejects when show fails later', async () => {
    const { controller, ads } = setup();
    controller.preload();
    ads[0]!.emit(AdEventType.LOADED);
    ads[0]!.show.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(controller.showAfterDone()).toBe(false);

    const later = setup();
    later.controller.preload();
    later.ads[0]!.emit(AdEventType.LOADED);
    later.ads[0]!.show.mockReturnValue(Promise.reject(new Error('late')));
    expect(later.controller.showAfterDone()).toBe(true);
    await new Promise((r) => setImmediate(r));
  });

  it('shows nothing when consent was withdrawn after the ad loaded', () => {
    const { controller, ads, flags, kv } = setup();
    controller.preload();
    ads[0]!.emit(AdEventType.LOADED);
    flags.canRequestAds = false;
    expect(controller.showAfterDone()).toBe(false);
    expect(ads[0]!.show).not.toHaveBeenCalled();
    expect(kv.getNumber(KEY)).toBeUndefined();
  });

  it('drops a loaded ad on request', () => {
    const { controller, ads, create } = setup();
    controller.preload();
    ads[0]!.emit(AdEventType.LOADED);
    controller.drop();
    expect(controller.showAfterDone()).toBe(false);
    controller.preload();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('drops a failed ad so the next preload creates again', () => {
    const { controller, ads, create } = setup();
    controller.preload();
    ads[0]!.emit(AdEventType.ERROR);
    expect(controller.showAfterDone()).toBe(false);
    controller.preload();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('survives load throwing', () => {
    const { controller, create } = setup();
    create.mockImplementationOnce(() => {
      throw new Error('sdk');
    });
    expect(() => controller.preload()).not.toThrow();
    controller.preload();
    expect(create).toHaveBeenCalledTimes(2);
  });
});
