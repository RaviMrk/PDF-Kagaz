import Constants from 'expo-constants';

import { adsEnabled as fromConfig } from '@/services/ads/adsConfig';

import { adsEnabled } from '../adsFlag';

jest.unmock('../adsFlag');
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: undefined } }));

const mocked = Constants as unknown as { expoConfig: unknown };

describe('adsEnabled (ADS_ENABLED flag)', () => {
  afterEach(() => {
    mocked.expoConfig = undefined;
  });

  it('is true only when the app config says so', () => {
    mocked.expoConfig = { extra: { ads: { enabled: true } } };
    expect(adsEnabled()).toBe(true);
    mocked.expoConfig = { extra: { ads: { enabled: false } } };
    expect(adsEnabled()).toBe(false);
    mocked.expoConfig = { extra: {} };
    expect(adsEnabled()).toBe(false);
    mocked.expoConfig = undefined;
    expect(adsEnabled()).toBe(false);
  });

  it('is the same function adsConfig exposes', () => {
    expect(fromConfig).toBe(adsEnabled);
  });
});
