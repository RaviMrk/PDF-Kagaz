import {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import type { AdsConfig } from './adsConfig';

export type ConsentState = {
  canRequestAds: boolean;
  privacyOptionsRequired: boolean;
  /** UMP status NOT_REQUIRED or OBTAINED; gates analytics (see telemetry.setAnalyticsConsent). */
  analyticsAllowed: boolean;
};

export type ConsentApi = Pick<
  typeof AdsConsent,
  'gatherConsent' | 'getConsentInfo' | 'showPrivacyOptionsForm'
>;

const NO_CONSENT: ConsentState = {
  canRequestAds: false,
  privacyOptionsRequired: false,
  analyticsAllowed: false,
};

function toState(info: AdsConsentInfo): ConsentState {
  return {
    canRequestAds: info.canRequestAds === true,
    privacyOptionsRequired:
      info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    analyticsAllowed:
      info.status === AdsConsentStatus.NOT_REQUIRED || info.status === AdsConsentStatus.OBTAINED,
  };
}

/** UMP's stored state from the last session; no network. Unreadable → no consent. */
export async function readCachedConsent(api: ConsentApi): Promise<ConsentState> {
  try {
    return toState(await api.getConsentInfo());
  } catch {
    return NO_CONSENT;
  }
}

/**
 * Updates the consent info and shows the form when UMP requires it. When that fails (offline,
 * timeout), the cached state decides; when that is unreadable too, there is no consent.
 */
export async function gatherAdsConsent(api: ConsentApi, config: AdsConfig): Promise<ConsentState> {
  try {
    return toState(
      await api.gatherConsent({
        debugGeography:
          config.debugGeography === 'EEA'
            ? AdsConsentDebugGeography.EEA
            : AdsConsentDebugGeography.DISABLED,
        testDeviceIdentifiers: config.testDeviceIds,
      }),
    );
  } catch {
    return readCachedConsent(api);
  }
}

/** Shows UMP's privacy options form, then re-reads the consent. Rejects only if the form fails. */
export async function openPrivacyOptions(api: ConsentApi): Promise<ConsentState> {
  await api.showPrivacyOptionsForm();
  return readCachedConsent(api);
}
