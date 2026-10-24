import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { PageScopeField } from '@/components/tools/PageScopeField';
import { PositionGrid } from '@/components/tools/PositionGrid';
import { RunButton } from '@/components/tools/RunButton';
import { useToolPreview } from '@/components/tools/useToolPreview';
import type { FileRow } from '@/db/schema';
import { failureMessage } from '@/services/tools/failureMessage';
import type { PageNumberOptions as Numbers, Passwords } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';
import { toAsciiDigits } from '@/utils/digits';

/** `passwords` is set when the file is locked: the password that opened its preview. */
type Props = { row: FileRow; onRun(opts: Numbers, passwords?: Passwords): void };

type Position = Numbers['position'];
type FontSizeKey = `${Numbers['fontSize']}`;

/** Page numbers go along the top or bottom edge only. */
const POSITIONS: readonly Position[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];
const FONT_SIZES: readonly FontSizeKey[] = ['10', '12', '14', '18'];
const START_MAX = 9999;

/** The typed start number (ASCII or Devanagari digits), or null when not 1..9999. */
function parseStart(text: string): number | null {
  const ascii = toAsciiDigits(text.trim());
  if (!/^\d{1,4}$/.test(ascii)) return null;
  const n = Number(ascii);
  return n >= 1 && n <= START_MAX ? n : null;
}

/** Add page numbers options; the staged preview gives the page count (and asks a locked file's password). */
export function PageNumberOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state: loaded, password, dialog } = useToolPreview(row);

  if (loaded.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textMuted }}>{t('tool.loadingPages')}</Text>
        {dialog}
      </View>
    );
  }
  if (loaded.kind === 'failed') {
    return (
      <View style={styles.center}>
        <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.danger }]}>
          {failureMessage(loaded.failure, row.name, t)}
        </Text>
      </View>
    );
  }
  return (
    <NumbersForm
      pageCount={loaded.pageCount}
      onRun={(opts) => (password === null ? onRun(opts) : onRun(opts, { 0: password }))}
    />
  );
}

type FormProps = { pageCount: number; onRun(opts: Numbers): void };

function NumbersForm({ pageCount, onRun }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [position, setPosition] = useState<Position>('bottom-center');
  const [format, setFormat] = useState<Numbers['format']>('n');
  const [startText, setStartText] = useState('1');
  const [fontSize, setFontSize] = useState<FontSizeKey>('12');
  const [pages, setPages] = useState<number[] | null>(null);

  const start = parseStart(startText);
  const ready = start !== null && (pages === null || pages.length > 0);
  const label = (key: string) => (
    <Text style={[styles.label, { color: colors.text }]}>{t(key)}</Text>
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {label('position.label')}
        <PositionGrid<Position>
          label={t('position.label')}
          value={position}
          onChange={setPosition}
          allowed={POSITIONS}
        />
        {label('numbers.format')}
        <ChoiceChips<Numbers['format']>
          label={t('numbers.format')}
          options={[
            { key: 'n', label: t('numbers.formatN') },
            { key: 'pageOfTotal', label: t('numbers.formatOf') },
          ]}
          value={format}
          onChange={setFormat}
        />
        {label('numbers.start')}
        <TextInput
          accessibilityLabel={t('numbers.start')}
          value={startText}
          onChangeText={setStartText}
          keyboardType="number-pad"
          maxLength={8}
          autoCorrect={false}
          style={[
            styles.input,
            { color: colors.text, borderColor: start === null ? colors.danger : colors.border },
          ]}
        />
        {start === null ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {t('numbers.startError')}
          </Text>
        ) : null}
        {label('numbers.fontSize')}
        <ChoiceChips<FontSizeKey>
          label={t('numbers.fontSize')}
          options={FONT_SIZES.map((key) => ({
            key,
            label: t('numbers.fontSizeValue', { size: Number(key) }),
          }))}
          value={fontSize}
          onChange={setFontSize}
        />
        <PageScopeField pageCount={pageCount} value={pages} onChange={setPages} />
      </ScrollView>
      <RunButton
        label={t('numbers.run')}
        disabled={!ready}
        onPress={() => {
          if (!ready || start === null) return;
          onRun({
            position,
            format,
            start,
            fontSize: Number(fontSize) as Numbers['fontSize'],
            pages: pages === null ? null : [...pages],
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 8, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  label: { fontWeight: '600' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
});
