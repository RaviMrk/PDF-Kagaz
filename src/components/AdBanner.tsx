import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useTranslation } from 'react-i18next';

import { adsEnabled, getAdsConfig } from '@/services/ads/adsConfig';
import { useAds } from '@/services/ads/adsStore';

/**
 * The adaptive anchored banner at the bottom of Home and Files. It sits in the screen's flex
 * column below the list, so it is above the tab bar (which clears the navigation bar) and never
 * covers content. The container has no fixed size: BannerAd itself is 0x0 until an ad loads, so
 * nothing is reserved before then, and the container is announced only once an ad is there. A
 * failed load removes the banner until the tab regains focus, so a transient offline start recovers.
 * The ad's width is fixed when it is requested, so a new window width (folding or unfolding a
 * foldable, multi-window) requests a new ad instead of leaving one clipped or too narrow.
 */
export function AdBanner({ placement }: { placement: 'home' | 'files' }) {
  const ready = useAds((s) => s.status === 'ready' && s.canRequestAds);
  const width = Math.round(useWindowDimensions().width);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFailed(false);
    }, []),
  );

  if (!adsEnabled() || !ready || failed) return null;
  return <BannerSlot key={width} placement={placement} onFailed={() => setFailed(true)} />;
}

function BannerSlot({
  placement,
  onFailed,
}: {
  placement: 'home' | 'files';
  onFailed: () => void;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  return (
    <View
      testID={`ad-banner-${placement}`}
      accessible={loaded}
      accessibilityLabel={loaded ? t('ads.label') : undefined}
      style={styles.container}
    >
      <BannerAd
        unitId={getAdsConfig().banner}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => {
          setLoaded(false);
          onFailed();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { width: '100%', alignItems: 'center' } });
