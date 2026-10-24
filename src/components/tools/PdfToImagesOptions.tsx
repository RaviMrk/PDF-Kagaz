import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { PagePicker } from '@/components/tools/PagePicker';
import { RunButton } from '@/components/tools/RunButton';
import { useToolPreview } from '@/components/tools/useToolPreview';
import type { FileRow } from '@/db/schema';
import { failureMessage } from '@/services/tools/failureMessage';
import type { ExportDpi, ImageFormat, Passwords } from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

/** What to save: the format, the DPI and the pages (null: all of them). */
export type PdfToImagesChoice = { format: ImageFormat; dpi: ExportDpi; pages: number[] | null };

/** `passwords` is set when the file is locked: the password that opened its preview. */
type Props = { row: FileRow; onRun(opts: PdfToImagesChoice, passwords?: Passwords): void };

type Which = 'all' | 'choose';
type DpiKey = `${ExportDpi}`;

const FORMATS: readonly ImageFormat[] = ['jpg', 'png'];
const DPIS: readonly DpiKey[] = ['72', '150', '300'];

/** PDF to images options; the staged preview gives the page count and the picker thumbnails. */
export function PdfToImagesOptions({ row, onRun }: Props) {
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
    <ImagesForm
      fileUri={loaded.fileUri}
      pageCount={loaded.pageCount}
      onRun={(opts) => (password === null ? onRun(opts) : onRun(opts, { 0: password }))}
    />
  );
}

type FormProps = { fileUri: string; pageCount: number; onRun(opts: PdfToImagesChoice): void };

function ImagesForm({ fileUri, pageCount, onRun }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [format, setFormat] = useState<ImageFormat>('jpg');
  const [dpi, setDpi] = useState<DpiKey>('150');
  const [which, setWhich] = useState<Which>('all');
  const [pages, setPages] = useState<number[]>([]);

  const count = which === 'all' ? pageCount : pages.length;
  const label = (key: string) => (
    <Text style={[styles.label, { color: colors.text }]}>{t(key)}</Text>
  );

  return (
    <View style={styles.root}>
      {label('toImages.format')}
      <ChoiceChips<ImageFormat>
        label={t('toImages.format')}
        options={FORMATS.map((key) => ({ key, label: t(`toImages.${key}`) }))}
        value={format}
        onChange={setFormat}
      />
      {label('toImages.dpi')}
      <ChoiceChips<DpiKey>
        label={t('toImages.dpi')}
        options={DPIS.map((key) => ({ key, label: t(`toImages.dpi${key}`) }))}
        value={dpi}
        onChange={setDpi}
      />
      <Text style={{ color: colors.textMuted }}>{t('toImages.dpiHint')}</Text>
      {label('toImages.which')}
      <ChoiceChips<Which>
        label={t('toImages.which')}
        options={[
          { key: 'all', label: t('toImages.all') },
          { key: 'choose', label: t('toImages.choose') },
        ]}
        value={which}
        onChange={setWhich}
      />
      {which === 'choose' ? (
        <View style={styles.picker}>
          <PagePicker
            pageCount={pageCount}
            fileUri={fileUri}
            selected={pages}
            onChange={setPages}
          />
        </View>
      ) : (
        <View style={styles.spacer} />
      )}
      <RunButton
        label={count > 0 ? t('toImages.runCount', { count }) : t('toImages.run')}
        disabled={count === 0}
        onPress={() => {
          if (count === 0) return;
          onRun({
            format,
            dpi: Number(dpi) as ExportDpi,
            pages: which === 'all' ? null : [...pages],
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  label: { fontWeight: '600' },
  picker: { flex: 1 },
  spacer: { flex: 1 },
});
