import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useTranslation } from 'react-i18next';

import { getAdsConfig } from '@/services/ads/adsConfig';
import { useAds } from '@/services/ads/adsStore';

/**
 * The adaptive anchored banner at the bottom of Home and Files. It sits in the screen's flex
 * column below the list, so it is above the tab bar (which clears the navigation bar) and never
 * covers content. Nothing is rendered, and no height reserved, until consent allows ads and the
 * first ad has been requested; a failed load removes it for the rest of the mount.
 */
export function AdBanner({ placement }: { placement: 'home' | 'files' }) {
  const { t } = useTranslation();
  const ready = useAds((s) => s.status === 'ready' && s.canRequestAds);
  const [failed, setFailed] = useState(false);
  if (!ready || failed) return null;
  return (
    <View
      testID={`ad-banner-${placement}`}
      accessibilityLabel={t('ads.label')}
      style={styles.container}
    >
      <BannerAd
        unitId={getAdsConfig().banner}
        size={BannerAdSize.LARGE_ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { width: '100%', alignItems: 'center' } });
