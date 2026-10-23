import { canShowInterstitial, INTERSTITIAL_CAP_MS } from '../interstitialCap';

describe('interstitial cap', () => {
  it('is three minutes', () => expect(INTERSTITIAL_CAP_MS).toBe(180_000));
  it('allows the first one', () => expect(canShowInterstitial(null, 0)).toBe(true));
  it('blocks just inside the cap', () => expect(canShowInterstitial(1000, 180_999)).toBe(false));
  it('allows exactly at the cap', () => expect(canShowInterstitial(1000, 181_000)).toBe(true));
  it('blocks when the clock moved back', () => expect(canShowInterstitial(5000, 4000)).toBe(false));
  it('takes a custom cap', () => expect(canShowInterstitial(0, 10, 10)).toBe(true));
});
