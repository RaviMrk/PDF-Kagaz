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
  /**
   * Gates analytics (telemetry.setAnalyticsConsent): UMP status NOT_REQUIRED, or OBTAINED with the
   * user's TCF choices granting storage (purpose 1) and content measurement (purpose 8). OBTAINED
   * alone is not enough: UMP reports it after any choice, "Do not consent" included.
   */
  analyticsAllowed: boolean;
};

export type ConsentApi = Pick<
  typeof AdsConsent,
  'gatherConsent' | 'getConsentInfo' | 'showPrivacyOptionsForm' | 'getUserChoices'
>;

const NO_CONSENT: ConsentState = {
  canRequestAds: false,
  privacyOptionsRequired: false,
  analyticsAllowed: false,
};

/** Unreadable choices → no analytics. */
async function choicesAllowAnalytics(api: ConsentApi): Promise<boolean> {
  try {
    const choices = await api.getUserChoices();
    return (
      choices.storeAndAccessInformationOnDevice === true &&
      choices.measureContentPerformance === true
    );
  } catch {
    return false;
  }
}

async function analyticsAllowed(api: ConsentApi, info: AdsConsentInfo): Promise<boolean> {
  if (info.status === AdsConsentStatus.NOT_REQUIRED) return true;
  if (info.status === AdsConsentStatus.OBTAINED) return choicesAllowAnalytics(api);
  return false;
}

/** Ads follow UMP's canRequestAds unchanged; only analytics looks at the TCF choices. */
async function toState(api: ConsentApi, info: AdsConsentInfo): Promise<ConsentState> {
  return {
    canRequestAds: info.canRequestAds === true,
    privacyOptionsRequired:
      info.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    analyticsAllowed: await analyticsAllowed(api, info),
  };
}

/** UMP's stored state from the last session; no network. Unreadable → no consent. */
export async function readCachedConsent(api: ConsentApi): Promise<ConsentState> {
  let info: AdsConsentInfo;
  try {
    info = await api.getConsentInfo();
  } catch {
    return NO_CONSENT;
  }
  return toState(api, info);
}

/**
 * Updates the consent info and shows the form when UMP requires it. When that fails (offline,
 * timeout), the cached state decides; when that is unreadable too, there is no consent.
 */
export async function gatherAdsConsent(api: ConsentApi, config: AdsConfig): Promise<ConsentState> {
  let info: AdsConsentInfo;
  try {
    info = await api.gatherConsent({
      debugGeography:
        config.debugGeography === 'EEA'
          ? AdsConsentDebugGeography.EEA
          : AdsConsentDebugGeography.DISABLED,
      testDeviceIdentifiers: config.testDeviceIds,
    });
  } catch {
    return readCachedConsent(api);
  }
  return toState(api, info);
}

/** Shows UMP's privacy options form, then re-reads the consent. Rejects only if the form fails. */
export async function openPrivacyOptions(api: ConsentApi): Promise<ConsentState> {
  await api.showPrivacyOptionsForm();
  return readCachedConsent(api);
}
