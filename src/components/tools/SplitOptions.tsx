import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/SegmentedControl';
import { PagePicker } from '@/components/tools/PagePicker';
import { RunButton } from '@/components/tools/RunButton';
import type { FileRow } from '@/db/schema';
import { failureMessage } from '@/services/tools/failureMessage';
import type { SplitOptions as SplitRequest } from '@/services/tools/runTool';
import type { ToolFailure } from '@/services/tools/toolJobRepo';
import { openToolPreview, type ToolPreview } from '@/services/tools/toolPreview';
import { useTheme } from '@/theme/useTheme';
import { toAsciiDigits } from '@/utils/digits';
import { formatPageRanges, parsePageRanges } from '@/utils/pageRanges';

type Props = { row: FileRow; onRun(split: SplitRequest): void };
type Mode = SplitRequest['mode'];
type Loaded =
  | { kind: 'loading' }
  | { kind: 'failed'; failure: ToolFailure }
  | { kind: 'ready'; fileUri: string; pageCount: number };
const LOADING: Loaded = { kind: 'loading' };

const capitalise = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

export function SplitOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fileKey = `${row.id}\n${row.uri}`;
  // A result for another file (the row changed) reads as loading until its own preview opens.
  const [result, setResult] = useState<{ fileKey: string; loaded: Loaded } | null>(null);
  const loaded = result?.fileKey === fileKey ? result.loaded : LOADING;

  const open = useEffectEvent(() => openToolPreview(row));
  // The preview stages the file for page counts and thumbnails; it lives as long as this step.
  // Keyed by file, not row object: a thumbnail or favourite update must not restage the file.
  useEffect(() => {
    let alive = true;
    let preview: ToolPreview | null = null;
    void open().then((r) => {
      if (!r.ok) {
        if (alive) setResult({ fileKey, loaded: { kind: 'failed', failure: r.failure } });
        return;
      }
      if (!alive) {
        r.preview.close();
        return;
      }
      preview = r.preview;
      const { fileUri, pageCount } = r.preview;
      setResult({ fileKey, loaded: { kind: 'ready', fileUri, pageCount } });
    });
    return () => {
      alive = false;
      preview?.close();
    };
  }, [fileKey]);

  if (loaded.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.textMuted }}>{t('tool.loadingPages')}</Text>
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
  return <SplitForm fileUri={loaded.fileUri} pageCount={loaded.pageCount} onRun={onRun} />;
}

type FormProps = { fileUri: string; pageCount: number; onRun(split: SplitRequest): void };

function SplitForm({ fileUri, pageCount, onRun }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('ranges');
  const [ranges, setRanges] = useState('');
  const [every, setEvery] = useState('');
  const [pages, setPages] = useState<number[]>([]);

  const parsedRanges = useMemo(() => parsePageRanges(ranges, pageCount), [ranges, pageCount]);
  const maxEvery = pageCount - 1;
  const n = /^\d+$/.test(toAsciiDigits(every.trim())) ? Number(toAsciiDigits(every.trim())) : NaN;
  const everyValid = Number.isInteger(n) && n >= 1 && n <= maxEvery;

  let request: SplitRequest | null = null;
  if (mode === 'ranges' && parsedRanges.ok) request = { mode, ranges };
  if (mode === 'everyN' && everyValid) request = { mode, n };
  if (mode === 'extract' && pages.length > 0) request = { mode, ranges: formatPageRanges(pages) };

  const input = (label: string, value: string, onChange: (v: string) => void, bad: boolean) => (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      autoCorrect={false}
      keyboardType={mode === 'everyN' ? 'number-pad' : 'default'}
      style={[
        styles.input,
        { color: colors.text, borderColor: bad ? colors.danger : colors.border },
      ]}
    />
  );
  const error = (text: string) => (
    <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
      {text}
    </Text>
  );
  const note = (text: string) => <Text style={{ color: colors.textMuted }}>{text}</Text>;

  return (
    <View style={styles.root}>
      <Text style={{ color: colors.textMuted }}>{t('split.pageCount', { count: pageCount })}</Text>
      <View style={styles.segments}>
        <SegmentedControl<Mode>
          options={[
            { key: 'ranges', label: t('split.modeRanges') },
            { key: 'everyN', label: t('split.modeEvery') },
            { key: 'extract', label: t('split.modeExtract') },
          ]}
          value={mode}
          onChange={setMode}
        />
      </View>
      {mode === 'ranges' ? (
        <View style={styles.form}>
          <Text style={{ color: colors.text }}>{t('split.rangesLabel')}</Text>
          {input(t('split.rangesLabel'), ranges, setRanges, ranges !== '' && !parsedRanges.ok)}
          {ranges === ''
            ? note(t('pages.rangePlaceholder'))
            : parsedRanges.ok
              ? note(t('split.makesFiles', { count: parsedRanges.groups.length }))
              : error(t(`pages.error${capitalise(parsedRanges.error)}`, { count: pageCount }))}
        </View>
      ) : null}
      {mode === 'everyN' ? (
        <View style={styles.form}>
          <Text style={{ color: colors.text }}>{t('split.everyLabel')}</Text>
          {input(t('split.everyLabel'), every, setEvery, every !== '' && !everyValid)}
          {every === ''
            ? null
            : everyValid
              ? note(t('split.makesFiles', { count: Math.ceil(pageCount / n) }))
              : error(t('split.everyError', { max: maxEvery }))}
        </View>
      ) : null}
      {mode === 'extract' ? (
        <View style={styles.picker}>
          {note(t('split.extractHint'))}
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
        label={t('split.run')}
        disabled={request === null}
        onPress={() => {
          if (request) onRun(request);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  segments: { flexDirection: 'row' },
  form: { gap: 8 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  picker: { flex: 1, gap: 8 },
  spacer: { flex: 1 },
});
