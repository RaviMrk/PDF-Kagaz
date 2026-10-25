import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { StampPosition } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

type Props<P extends StampPosition> = {
  value: P;
  onChange(position: P): void;
  /** The cells offered (default all nine); the others stay as empty space, so the grid keeps the page's shape. */
  allowed?: readonly P[];
  /** The visible field label; names the radio group for screen readers. */
  label: string;
  /** Dims and blocks every cell. */
  disabled?: boolean;
};

const ROWS: readonly (readonly StampPosition[])[] = [
  ['top-left', 'top-center', 'top-right'],
  ['middle-left', 'center', 'middle-right'],
  ['bottom-left', 'bottom-center', 'bottom-right'],
];

const camel = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Where a stamp goes on the page, as a 3 × 3 grid of radio cells. */
export function PositionGrid<P extends StampPosition>({
  value,
  onChange,
  allowed,
  label,
  disabled = false,
}: Props<P>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const offered = (p: StampPosition): p is P =>
    allowed === undefined || (allowed as readonly StampPosition[]).includes(p);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((p) => {
            if (!offered(p)) return <View key={p} style={styles.cell} />;
            const checked = p === value;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityLabel={t(`position.${camel(p)}`)}
                accessibilityState={{ checked, disabled }}
                disabled={disabled}
                onPress={() => onChange(p)}
                style={[
                  styles.cell,
                  styles.radio,
                  checked
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.surface, borderColor: colors.border },
                  disabled && styles.dim,
                ]}
              >
                <Text
                  style={[styles.dot, { color: checked ? colors.onPrimary : colors.textMuted }]}
                >
                  {checked ? '●' : '○'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 8, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', gap: 8 },
  cell: { width: 64, minWidth: 48, minHeight: 48 },
  radio: { borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { fontSize: 16 },
  dim: { opacity: 0.4 },
});
