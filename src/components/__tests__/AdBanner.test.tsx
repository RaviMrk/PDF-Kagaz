import { Dimensions, StyleSheet } from 'react-native';
import { act, cleanup, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import * as ads from 'react-native-google-mobile-ads';

import { initI18n } from '@/i18n';
import { TEST_IDS } from '@/config/adsIds';
import { useAds } from '@/services/ads/adsStore';

import { AdBanner } from '../AdBanner';

const mockFocus: { cbs: (() => void)[]; again(): void } = {
  cbs: [],
  again() {
    mockFocus.cbs.forEach((cb) => cb());
  },
};
jest.mock('expo-router', () => ({
  // Runs like focus on mount; mockFocus.again() simulates the tab regaining focus.
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(() => {
      mockFocus.cbs.push(cb);
      cb();
      return () => {
        mockFocus.cbs = mockFocus.cbs.filter((c) => c !== cb);
      };
    }, [cb]);
  },
}));

const fake = (ads as unknown as { fakeBannerProps: unknown }).fakeBannerProps as () => {
  unitId: string;
  size: string;
  onAdFailedToLoad: () => void;
  onAdLoaded: () => void;
} | null;

describe('AdBanner', () => {
  const i18n = initI18n('en');
  const renderBanner = (placement: 'home' | 'files') =>
    render(
      <I18nextProvider i18n={i18n}>
        <AdBanner placement={placement} />
      </I18nextProvider>,
    );
  afterEach(async () => {
    await cleanup();
    useAds.setState({ status: 'idle', canRequestAds: false });
  });

  it('renders a labelled banner with the test unit when ads are ready', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    const view = await renderBanner('home');
    expect(view.getByTestId('banner-ad')).toBeTruthy();
    expect(fake()?.unitId).toBe(TEST_IDS.banner);
    expect(fake()?.size).toBe('LARGE_ANCHORED_ADAPTIVE_BANNER');
  });

  it.each([
    ['off', false],
    ['gathering', false],
    ['ready', false],
  ] as const)('renders nothing for status %s with canRequestAds %s', async (status, can) => {
    useAds.setState({ status, canRequestAds: can });
    expect((await renderBanner('files')).toJSON()).toBeNull();
  });

  it('renders nothing when consent allows but the status is not ready', async () => {
    useAds.setState({ status: 'off', canRequestAds: true });
    expect((await renderBanner('files')).toJSON()).toBeNull();
  });

  it('renders nothing after the ad fails to load', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    const view = await renderBanner('home');
    await act(async () => fake()?.onAdFailedToLoad());
    expect(view.toJSON()).toBeNull();
  });

  it('is not announced, and has no reserved size, until an ad has loaded', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    const view = await renderBanner('home');
    const box = view.getByTestId('ad-banner-home');
    expect(box.props.accessible).toBeFalsy();
    expect(view.queryByLabelText('Advertisement')).toBeNull();
    const style = StyleSheet.flatten(box.props.style);
    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBeUndefined();
    await act(async () => fake()?.onAdLoaded());
    expect(view.getByLabelText('Advertisement')).toBeTruthy();
  });

  it('tries again when the tab regains focus after a failed load', async () => {
    useAds.setState({ status: 'ready', canRequestAds: true });
    const view = await renderBanner('files');
    await act(async () => fake()?.onAdFailedToLoad());
    expect(view.toJSON()).toBeNull();
    await act(async () => mockFocus.again());
    expect(view.getByTestId('banner-ad')).toBeTruthy();
  });

  describe('when the window width changes (fold or unfold)', () => {
    const initial = Dimensions.get('window');
    const resize = (width: number, height: number) =>
      act(async () => {
        Dimensions.set({
          window: { ...initial, width, height },
          screen: { ...initial, width, height },
        });
      });
    afterEach(() => resize(initial.width, initial.height));

    it('requests a new ad sized for the new width', async () => {
      useAds.setState({ status: 'ready', canRequestAds: true });
      await resize(841, 701);
      const view = await renderBanner('home');
      await act(async () => fake()?.onAdLoaded());
      const before = view.getByTestId('banner-ad');

      await resize(411, 797);
      const after = view.getByTestId('banner-ad');
      expect(after).not.toBe(before);
      // The new ad is not announced until it has loaded.
      expect(view.queryByLabelText('Advertisement')).toBeNull();
    });

    it('keeps the loaded ad when only the height changes', async () => {
      useAds.setState({ status: 'ready', canRequestAds: true });
      await resize(411, 797);
      const view = await renderBanner('home');
      await act(async () => fake()?.onAdLoaded());
      const before = view.getByTestId('banner-ad');

      await resize(411, 600);
      expect(view.getByTestId('banner-ad')).toBe(before);
      expect(view.getByLabelText('Advertisement')).toBeTruthy();
    });
  });
});
