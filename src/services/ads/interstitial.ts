import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';

import { mmkvStore } from '@/services/prefs/mmkvStore';
import type { KeyValueStore } from '@/services/prefs/KeyValueStore';

import { adsEnabled, getAdsConfig } from './adsConfig';
import { useAds } from './adsStore';
import { canShowInterstitial } from './interstitialCap';

const LAST_SHOWN_KEY = 'ads.lastInterstitialAt';

export type InterstitialLike = {
  readonly loaded: boolean;
  load(): void;
  show(): Promise<void>;
  addAdEventListener(type: string, listener: () => void): () => void;
};

export type InterstitialDeps = {
  create: (unitId: string) => InterstitialLike;
  kv: KeyValueStore;
  now: () => number;
  canRequestAds: () => boolean;
  unitId: string;
};

/**
 * Loads an interstitial ahead of time and shows it only when it is already loaded and the 3-minute
 * cap (persisted, so it survives restarts) allows. Nothing here waits, retries or throws.
 */
export function createInterstitialController(deps: InterstitialDeps) {
  let ad: InterstitialLike | null = null;

  function drop(target: InterstitialLike) {
    if (ad === target) ad = null;
  }

  return {
    preload(): void {
      if (ad || !deps.canRequestAds()) return;
      try {
        const created = deps.create(deps.unitId);
        ad = created;
        created.addAdEventListener(AdEventType.ERROR, () => drop(created));
        created.addAdEventListener(AdEventType.CLOSED, () => drop(created));
        created.load();
      } catch {
        ad = null;
      }
    },

    /** Forget the current ad (consent withdrawn). */
    drop(): void {
      ad = null;
    },

    showAfterDone(): boolean {
      const current = ad;
      if (!current?.loaded || !deps.canRequestAds()) return false;
      const now = deps.now();
      const last = deps.kv.getNumber(LAST_SHOWN_KEY) ?? null;
      if (!canShowInterstitial(last, now)) {
        // A clock moved back: restart the window from now.
        if (last !== null && now < last) deps.kv.set(LAST_SHOWN_KEY, now);
        return false;
      }
      deps.kv.set(LAST_SHOWN_KEY, now);
      ad = null;
      try {
        current.show().catch(() => {});
      } catch {
        return false;
      }
      return true;
    },
  };
}

export const interstitial = createInterstitialController({
  create: (unitId) => InterstitialAd.createForAdRequest(unitId) as unknown as InterstitialLike,
  kv: mmkvStore,
  now: Date.now,
  canRequestAds: () => adsEnabled() && useAds.getState().canRequestAds,
  unitId: getAdsConfig().interstitial,
});

// A loaded ad must not outlive consent: drop it as soon as ads go off.
useAds.subscribe((state) => {
  if (!state.canRequestAds) interstitial.drop();
});
