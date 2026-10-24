import mobileAds, { AdsConsent, MaxAdContentRating } from 'react-native-google-mobile-ads';
import { create } from 'zustand';

import { telemetry } from '@/services/telemetry/telemetry';

import { getAdsConfig, type AdsConfig } from './adsConfig';
import {
  gatherAdsConsent,
  openPrivacyOptions,
  readCachedConsent,
  type ConsentApi,
  type ConsentState,
} from './adsConsent';

type MobileAdsInstance = {
  setRequestConfiguration: (config: {
    maxAdContentRating: MaxAdContentRating;
    tagForChildDirectedTreatment: boolean;
    tagForUnderAgeOfConsent: boolean;
  }) => Promise<void>;
  initialize: () => Promise<unknown>;
};

export type AdsStoreDeps = {
  consent: ConsentApi;
  mobileAds: () => MobileAdsInstance;
  config: AdsConfig;
  /** Analytics follows ConsentState.analyticsAllowed (telemetry.setAnalyticsConsent). */
  setAnalyticsConsent: (allowed: boolean) => Promise<void>;
};

export type AdsStatus = 'idle' | 'gathering' | 'ready' | 'off';

export type AdsState = {
  status: AdsStatus;
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  /** Consent, then the SDK; once per process (a second call returns the same promise). */
  start: () => Promise<void>;
  /** Shows UMP's privacy options and applies the new consent; false when the form failed. */
  openPrivacyOptions: () => Promise<boolean>;
};

/**
 * No ad request happens before consent gathering ends with canRequestAds: the SDK is configured
 * and initialized only then. Every failure leaves ads off; nothing here throws or rejects.
 */
export function createAdsStore(deps: AdsStoreDeps) {
  let started: Promise<void> | null = null;
  // One SDK start per process, shared by overlapping grants; cleared on failure so a later grant retries.
  let sdkStart: Promise<void> | null = null;
  // Only the latest apply() may set the status, so a slow 'ready' never overwrites a withdrawal.
  let applySeq = 0;

  return create<AdsState>()((set) => {
    function applyAnalytics(allowed: boolean) {
      try {
        deps.setAnalyticsConsent(allowed).catch(() => {});
      } catch {
        // Telemetry never affects ads.
      }
    }

    function startSdk(): Promise<void> {
      sdkStart ??= (async () => {
        const sdk = deps.mobileAds();
        await sdk.setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        });
        await sdk.initialize();
      })().catch((error: unknown) => {
        sdkStart = null;
        throw error;
      });
      return sdkStart;
    }

    async function apply(consent: ConsentState): Promise<void> {
      const seq = ++applySeq;
      applyAnalytics(consent.analyticsAllowed);
      const { privacyOptionsRequired } = consent;
      if (!consent.canRequestAds) {
        set({ status: 'off', canRequestAds: false, privacyOptionsRequired });
        return;
      }
      let next: Pick<AdsState, 'status' | 'canRequestAds'> = {
        status: 'ready',
        canRequestAds: true,
      };
      try {
        await startSdk();
      } catch {
        next = { status: 'off', canRequestAds: false };
      }
      if (seq === applySeq) set({ ...next, privacyOptionsRequired });
    }

    async function run(): Promise<void> {
      set({ status: 'gathering' });
      try {
        // The stored status first, so analytics follows consent before the network form ends.
        applyAnalytics((await readCachedConsent(deps.consent)).analyticsAllowed);
        await apply(await gatherAdsConsent(deps.consent, deps.config));
      } catch {
        applyAnalytics(false);
        set({ status: 'off', canRequestAds: false });
      }
    }

    return {
      status: 'idle',
      canRequestAds: false,
      privacyOptionsRequired: false,
      start() {
        started ??= run();
        return started;
      },
      async openPrivacyOptions() {
        let consent: ConsentState;
        try {
          consent = await openPrivacyOptions(deps.consent);
        } catch {
          return false;
        }
        await apply(consent);
        return true;
      },
    };
  });
}

export const useAds = createAdsStore({
  consent: AdsConsent,
  mobileAds,
  config: getAdsConfig(),
  setAnalyticsConsent: (allowed) => telemetry.setAnalyticsConsent(allowed),
});
