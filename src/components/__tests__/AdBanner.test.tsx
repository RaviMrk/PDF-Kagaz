import { act, cleanup, render } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import * as ads from 'react-native-google-mobile-ads';

import { initI18n } from '@/i18n';
import { TEST_IDS } from '@/config/adsIds';
import { useAds } from '@/services/ads/adsStore';

import { AdBanner } from '../AdBanner';

const fake = (ads as unknown as { fakeBannerProps: unknown }).fakeBannerProps as () => {
  unitId: string;
  size: string;
  onAdFailedToLoad: () => void;
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
    expect(view.getByLabelText('Advertisement')).toBeTruthy();
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
});
