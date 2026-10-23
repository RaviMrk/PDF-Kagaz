import {
  AdsConsentDebugGeography,
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import type { AdsConfig } from '../adsConfig';
import {
  gatherAdsConsent,
  openPrivacyOptions,
  readCachedConsent,
  type ConsentApi,
} from '../adsConsent';

const config: AdsConfig = {
  banner: 'b',
  interstitial: 'i',
  debugGeography: 'disabled',
  testDeviceIds: [],
};

function info(over: Partial<AdsConsentInfo> = {}): AdsConsentInfo {
  return {
    status: AdsConsentStatus.OBTAINED,
    canRequestAds: true,
    privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus.NOT_REQUIRED,
    isConsentFormAvailable: false,
    ...over,
  };
}

function fakeApi(): jest.Mocked<ConsentApi> {
  return {
    gatherConsent: jest.fn(() => Promise.resolve(info())),
    getConsentInfo: jest.fn(() => Promise.resolve(info())),
    showPrivacyOptionsForm: jest.fn(() => Promise.resolve(info())),
  } as unknown as jest.Mocked<ConsentApi>;
}

describe('gatherAdsConsent', () => {
  it('reports whether ads may be requested and whether privacy options are required', async () => {
    const api = fakeApi();
    api.gatherConsent.mockResolvedValue(
      info({ privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus.REQUIRED }),
    );
    await expect(gatherAdsConsent(api, config)).resolves.toEqual({
      canRequestAds: true,
      privacyOptionsRequired: true,
      analyticsAllowed: true,
    });
    expect(api.gatherConsent).toHaveBeenCalledWith({
      debugGeography: AdsConsentDebugGeography.DISABLED,
      testDeviceIdentifiers: [],
    });
  });

  it('lets the cached consent decide when gathering fails (offline)', async () => {
    const api = fakeApi();
    api.gatherConsent.mockRejectedValue(new Error('offline'));
    api.getConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    await expect(gatherAdsConsent(api, config)).resolves.toEqual({
      canRequestAds: true,
      privacyOptionsRequired: false,
      analyticsAllowed: true,
    });
  });

  it('turns ads and analytics off when the consent cannot be read at all', async () => {
    const api = fakeApi();
    api.gatherConsent.mockRejectedValue(new Error('offline'));
    api.getConsentInfo.mockRejectedValue(new Error('no info'));
    await expect(gatherAdsConsent(api, config)).resolves.toEqual({
      canRequestAds: false,
      privacyOptionsRequired: false,
      analyticsAllowed: false,
    });
  });

  it('passes the EEA debug geography and the test devices', async () => {
    const api = fakeApi();
    await gatherAdsConsent(api, { ...config, debugGeography: 'EEA', testDeviceIds: ['A1', 'B2'] });
    expect(api.gatherConsent).toHaveBeenCalledWith({
      debugGeography: AdsConsentDebugGeography.EEA,
      testDeviceIdentifiers: ['A1', 'B2'],
    });
  });

  it.each([
    [AdsConsentStatus.OBTAINED, true],
    [AdsConsentStatus.NOT_REQUIRED, true],
    [AdsConsentStatus.REQUIRED, false],
    [AdsConsentStatus.UNKNOWN, false],
  ])('allows analytics only with consent status %s → %s', async (status, allowed) => {
    const api = fakeApi();
    api.gatherConsent.mockResolvedValue(info({ status }));
    expect((await gatherAdsConsent(api, config)).analyticsAllowed).toBe(allowed);
  });
});

describe('openPrivacyOptions', () => {
  it('shows the form and then re-reads the consent', async () => {
    const api = fakeApi();
    api.getConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, status: AdsConsentStatus.REQUIRED }),
    );
    await expect(openPrivacyOptions(api)).resolves.toEqual({
      canRequestAds: false,
      privacyOptionsRequired: false,
      analyticsAllowed: false,
    });
    expect(api.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(api.showPrivacyOptionsForm.mock.invocationCallOrder[0]).toBeLessThan(
      api.getConsentInfo.mock.invocationCallOrder[0]!,
    );
  });

  it('rejects when the form fails', async () => {
    const api = fakeApi();
    api.showPrivacyOptionsForm.mockRejectedValue(new Error('form'));
    await expect(openPrivacyOptions(api)).rejects.toThrow('form');
    expect(api.getConsentInfo).not.toHaveBeenCalled();
  });
});

describe('readCachedConsent', () => {
  it('reads UMP state without a network request', async () => {
    const api = fakeApi();
    api.getConsentInfo.mockResolvedValue(info({ status: AdsConsentStatus.NOT_REQUIRED }));
    await expect(readCachedConsent(api)).resolves.toMatchObject({ analyticsAllowed: true });
    api.getConsentInfo.mockRejectedValue(new Error('x'));
    await expect(readCachedConsent(api)).resolves.toEqual({
      canRequestAds: false,
      privacyOptionsRequired: false,
      analyticsAllowed: false,
    });
    expect(api.gatherConsent).not.toHaveBeenCalled();
  });
});
