import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/useTheme';

type Props = {
  visible?: boolean;
  /** Android back. */
  onRequestClose(): void;
  /** Tapping the scrim; without it the scrim only dims. */
  onScrimPress?(): void;
  /** Accessibility label of a dismissing scrim. */
  scrimLabel?: string;
  animationType?: 'slide' | 'fade';
  /** Padding of the panel; the bottom also clears the navigation bar. */
  padding?: number;
  gap?: number;
  radius?: number;
  testID?: string;
  children: ReactNode;
};

/**
 * A panel anchored to the bottom of a transparent Modal. The window is edge-to-edge, so the panel
 * adds the bottom inset to its padding and never sits under 3-button navigation.
 */
export function BottomSheet({
  visible = true,
  onRequestClose,
  onScrimPress,
  scrimLabel,
  animationType = 'slide',
  padding = 16,
  gap,
  radius = 16,
  testID,
  children,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      testID={testID}
      transparent
      animationType={animationType}
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <View style={styles.scrim}>
        {onScrimPress ? (
          <Pressable accessibilityLabel={scrimLabel} onPress={onScrimPress} style={styles.fill} />
        ) : (
          <View style={styles.fill} />
        )}
        <View
          testID="bottom-sheet-panel"
          style={{
            backgroundColor: colors.background,
            padding,
            paddingBottom: padding + insets.bottom,
            gap,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  fill: { flex: 1 },
});
