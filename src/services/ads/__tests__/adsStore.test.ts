import {
  AdsConsentPrivacyOptionsRequirementStatus,
  AdsConsentStatus,
  MaxAdContentRating,
  type AdsConsentInfo,
} from 'react-native-google-mobile-ads';

import type { AdsConfig } from '../adsConfig';
import type { ConsentApi } from '../adsConsent';
import { createAdsStore, type AdsStoreDeps } from '../adsStore';

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

function setup(gathered: AdsConsentInfo = info(), cached: AdsConsentInfo = info()) {
  const consent = {
    gatherConsent: jest.fn(() => Promise.resolve(gathered)),
    getConsentInfo: jest.fn(() => Promise.resolve(cached)),
    showPrivacyOptionsForm: jest.fn(() => Promise.resolve(gathered)),
    getUserChoices: jest.fn(() =>
      Promise.resolve({ storeAndAccessInformationOnDevice: true, measureContentPerformance: true }),
    ),
  } as unknown as jest.Mocked<ConsentApi>;
  const instance = {
    setRequestConfiguration: jest.fn((_c: unknown) => Promise.resolve()),
    initialize: jest.fn(() => Promise.resolve([])),
  };
  const setAnalyticsConsent = jest.fn((_allowed: boolean) => Promise.resolve());
  const deps: AdsStoreDeps = {
    consent,
    mobileAds: () => instance,
    config,
    setAnalyticsConsent,
  };
  return { store: createAdsStore(deps), consent, instance, setAnalyticsConsent };
}

describe('ads store', () => {
  it('starts idle with ads off', () => {
    const { store } = setup();
    expect(store.getState()).toMatchObject({
      status: 'idle',
      canRequestAds: false,
      privacyOptionsRequired: false,
    });
  });

  it('never initializes the SDK when consent does not allow ads', async () => {
    const { store, instance } = setup(info({ canRequestAds: false }));
    await store.getState().start();
    expect(store.getState()).toMatchObject({ status: 'off', canRequestAds: false });
    expect(instance.setRequestConfiguration).not.toHaveBeenCalled();
    expect(instance.initialize).not.toHaveBeenCalled();
  });

  it('configures requests before initializing when consent allows ads', async () => {
    const { store, instance } = setup(
      info({ privacyOptionsRequirementStatus: AdsConsentPrivacyOptionsRequirementStatus.REQUIRED }),
    );
    const started = store.getState().start();
    expect(store.getState().status).toBe('gathering');
    await started;
    expect(instance.setRequestConfiguration).toHaveBeenCalledWith({
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    expect(instance.setRequestConfiguration.mock.invocationCallOrder[0]).toBeLessThan(
      instance.initialize.mock.invocationCallOrder[0]!,
    );
    expect(store.getState()).toEqual(
      expect.objectContaining({
        status: 'ready',
        canRequestAds: true,
        privacyOptionsRequired: true,
      }),
    );
  });

  it('gathers consent once per process', async () => {
    const { store, consent, instance } = setup();
    const first = store.getState().start();
    const second = store.getState().start();
    expect(second).toBe(first);
    await first;
    await store.getState().start();
    expect(consent.gatherConsent).toHaveBeenCalledTimes(1);
    expect(instance.initialize).toHaveBeenCalledTimes(1);
  });

  it('leaves ads off when initializing fails', async () => {
    const { store, instance } = setup();
    instance.initialize.mockRejectedValue(new Error('init'));
    await expect(store.getState().start()).resolves.toBeUndefined();
    expect(store.getState()).toMatchObject({ status: 'off', canRequestAds: false });
  });

  it('leaves ads off when the SDK throws synchronously', async () => {
    const { store, instance } = setup();
    instance.setRequestConfiguration.mockImplementation(() => {
      throw new Error('bad config');
    });
    await expect(store.getState().start()).resolves.toBeUndefined();
    expect(store.getState().status).toBe('off');
    expect(instance.initialize).not.toHaveBeenCalled();
  });

  it('turns ads off at once when the privacy options withdraw consent', async () => {
    const { store, consent, setAnalyticsConsent } = setup();
    await store.getState().start();
    consent.getConsentInfo.mockResolvedValue(
      info({ canRequestAds: false, status: AdsConsentStatus.REQUIRED }),
    );
    await expect(store.getState().openPrivacyOptions()).resolves.toBe(true);
    expect(store.getState()).toMatchObject({ status: 'off', canRequestAds: false });
    expect(setAnalyticsConsent).toHaveBeenLastCalledWith(false);
  });

  it('initializes the SDK when the privacy options grant consent later', async () => {
    const { store, consent, instance } = setup(info({ canRequestAds: false }));
    await store.getState().start();
    consent.getConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
    await store.getState().openPrivacyOptions();
    expect(instance.initialize).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ status: 'ready', canRequestAds: true });
  });

  it('keeps the state and reports false when the privacy form fails', async () => {
    const { store, consent } = setup();
    await store.getState().start();
    consent.showPrivacyOptionsForm.mockRejectedValue(new Error('form'));
    await expect(store.getState().openPrivacyOptions()).resolves.toBe(false);
    expect(store.getState()).toMatchObject({ status: 'ready', canRequestAds: true });
  });

  describe('overlapping consent changes', () => {
    it('ends off when consent is withdrawn while an earlier initialize is still pending', async () => {
      const { store, consent, instance } = setup(info({ canRequestAds: false }));
      await store.getState().start();
      let finishInit: () => void = () => {};
      instance.initialize.mockReturnValue(
        new Promise<never[]>((resolve) => {
          finishInit = () => resolve([]);
        }),
      );
      consent.getConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
      const grant = store.getState().openPrivacyOptions();
      await new Promise((r) => setImmediate(r));
      consent.getConsentInfo.mockResolvedValue(info({ canRequestAds: false }));
      await store.getState().openPrivacyOptions();
      expect(store.getState()).toMatchObject({ status: 'off', canRequestAds: false });
      finishInit();
      await grant;
      expect(store.getState()).toMatchObject({ status: 'off', canRequestAds: false });
    });

    it('initializes the SDK once for two concurrent grants', async () => {
      const { store, consent, instance } = setup(info({ canRequestAds: false }));
      await store.getState().start();
      consent.getConsentInfo.mockResolvedValue(info({ canRequestAds: true }));
      await Promise.all([
        store.getState().openPrivacyOptions(),
        store.getState().openPrivacyOptions(),
      ]);
      expect(instance.initialize).toHaveBeenCalledTimes(1);
      expect(instance.setRequestConfiguration).toHaveBeenCalledTimes(1);
      expect(store.getState()).toMatchObject({ status: 'ready', canRequestAds: true });
    });

    it('retries the SDK start after a failed initialize', async () => {
      const { store, consent, instance } = setup();
      instance.initialize.mockRejectedValueOnce(new Error('init'));
      await store.getState().start();
      expect(store.getState().status).toBe('off');
      consent.getConsentInfo.mockResolvedValue(info());
      await store.getState().openPrivacyOptions();
      expect(instance.initialize).toHaveBeenCalledTimes(2);
      expect(store.getState().status).toBe('ready');
    });
  });

  describe('analytics consent', () => {
    it('applies the cached consent before the network form finishes, then the gathered one', async () => {
      const { store, consent, setAnalyticsConsent } = setup(
        info({ status: AdsConsentStatus.REQUIRED, canRequestAds: false }),
        info({ status: AdsConsentStatus.OBTAINED }),
      );
      let finishGather: (i: AdsConsentInfo) => void = () => {};
      consent.gatherConsent.mockReturnValue(
        new Promise<AdsConsentInfo>((resolve) => {
          finishGather = resolve;
        }),
      );
      const started = store.getState().start();
      await new Promise((r) => setImmediate(r));
      expect(setAnalyticsConsent.mock.calls).toEqual([[true]]);
      finishGather(info({ status: AdsConsentStatus.REQUIRED, canRequestAds: false }));
      await started;
      expect(setAnalyticsConsent.mock.calls).toEqual([[true], [false]]);
    });

    it('allows analytics when consent is not required', async () => {
      const { store, setAnalyticsConsent } = setup(
        info({ status: AdsConsentStatus.NOT_REQUIRED }),
        info({ status: AdsConsentStatus.UNKNOWN }),
      );
      await store.getState().start();
      expect(setAnalyticsConsent.mock.calls).toEqual([[false], [true]]);
    });

    it('turns analytics off when the consent cannot be read', async () => {
      const { store, consent, setAnalyticsConsent } = setup();
      consent.getConsentInfo.mockRejectedValue(new Error('no info'));
      consent.gatherConsent.mockRejectedValue(new Error('offline'));
      await store.getState().start();
      expect(setAnalyticsConsent).toHaveBeenCalled();
      expect(setAnalyticsConsent.mock.calls.every(([allowed]) => allowed === false)).toBe(true);
      expect(store.getState().status).toBe('off');
    });

    it('uses the cached consent when gathering fails offline', async () => {
      const { store, consent, setAnalyticsConsent, instance } = setup();
      consent.gatherConsent.mockRejectedValue(new Error('offline'));
      await store.getState().start();
      expect(setAnalyticsConsent).toHaveBeenLastCalledWith(true);
      expect(instance.initialize).toHaveBeenCalledTimes(1);
      expect(store.getState().status).toBe('ready');
    });

    it('privacy form withdrawal → analytics off while UMP still reports OBTAINED', async () => {
      const { store, consent, setAnalyticsConsent } = setup();
      await store.getState().start();
      expect(setAnalyticsConsent).toHaveBeenLastCalledWith(true);
      consent.getUserChoices.mockResolvedValue({
        storeAndAccessInformationOnDevice: true,
        measureContentPerformance: false,
      } as Awaited<ReturnType<ConsentApi['getUserChoices']>>);
      await expect(store.getState().openPrivacyOptions()).resolves.toBe(true);
      expect(setAnalyticsConsent).toHaveBeenLastCalledWith(false);
      // Ads keep Google's canRequestAds contract.
      expect(store.getState()).toMatchObject({ status: 'ready', canRequestAds: true });
    });

    it('never lets a failing telemetry call break the ads start', async () => {
      const { store, setAnalyticsConsent } = setup();
      setAnalyticsConsent.mockImplementation(() => {
        throw new Error('telemetry');
      });
      await store.getState().start();
      expect(store.getState().status).toBe('ready');
    });
  });
});
