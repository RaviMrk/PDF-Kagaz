import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';

import { RunButton } from '@/components/tools/RunButton';
import { SignaturePickerRow } from '@/components/tools/SignaturePickerRow';
import { SignaturePlacer } from '@/components/tools/SignaturePlacer';
import { useToolPreview } from '@/components/tools/useToolPreview';
import type { FileRow } from '@/db/schema';
import { failureMessage } from '@/services/tools/failureMessage';
import { DEFAULT_PLACEMENT, MAX_PLACEMENTS, type Placement } from '@/services/tools/placement';
import type { Passwords, SignaturePlacement } from '@/services/tools/runTool';
import { useSignatures } from '@/stores/signaturesStore';
import { useTheme } from '@/theme/useTheme';

/** `passwords` is set when the file is locked: the password that opened its preview. */
type Props = { row: FileRow; onRun(placements: SignaturePlacement[], passwords?: Passwords): void };

/** Sign PDF options; the staged preview gives the pages (and asks a locked file's password). */
export function SignOptions({ row, onRun }: Props) {
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
    <SignForm
      fileUri={loaded.fileUri}
      pageCount={loaded.pageCount}
      onRun={(placements) =>
        password === null ? onRun(placements) : onRun(placements, { 0: password })
      }
    />
  );
}

type Size = { uri: string; width: number; height: number };

/**
 * The chosen saved signature: the newest at first and whenever a new one appears (back from the
 * pad); another one if the chosen one was deleted. The list is reloaded on every focus.
 */
function useChosenSignature() {
  const items = useSignatures((s) => s.items);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const known = useRef<Set<number> | null>(null);

  useFocusEffect(
    useCallback(() => {
      useSignatures.getState().load();
    }, []),
  );

  useEffect(() => {
    const before = known.current;
    known.current = new Set(items.map((i) => i.id));
    const added = before !== null && items.some((i) => !before.has(i.id));
    setSelectedId((id) =>
      added || id === null || !items.some((i) => i.id === id) ? (items[0]?.id ?? null) : id,
    );
  }, [items]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const uri = selected?.pngPath ?? null;
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    if (uri === null) return;
    let alive = true;
    Image.getSize(uri).then(
      ({ width, height }) => {
        if (alive) setSize({ uri, width, height });
      },
      () => {
        // An unreadable PNG cannot be placed; the job would fail on it as signatureGone.
        if (alive) setSize(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  return {
    selectedId: selected?.id ?? null,
    select: setSelectedId,
    signature: size !== null && size.uri === uri ? size : null,
  };
}

type FormProps = {
  fileUri: string;
  pageCount: number;
  onRun(placements: SignaturePlacement[]): void;
};

function SignForm({ fileUri, pageCount, onRun }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { selectedId, select, signature } = useChosenSignature();
  const [page, setPage] = useState(1);
  const [value, setValue] = useState<Placement>(DEFAULT_PLACEMENT);
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);

  const full = placements.length >= MAX_PLACEMENTS;
  const canAdd = selectedId !== null && signature !== null && !full;

  const add = () => {
    if (!canAdd) return;
    setPlacements((list) => [...list, { signatureId: selectedId, page, ...value }]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SignaturePickerRow selectedId={selectedId} onSelect={select} />
        {signature ? (
          <SignaturePlacer
            fileUri={fileUri}
            page={page}
            pageCount={pageCount}
            signature={signature}
            value={value}
            onChange={setValue}
            onPageChange={(p) => setPage(Math.min(pageCount, Math.max(1, p)))}
          />
        ) : null}
        {selectedId !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sign.add')}
            accessibilityState={{ disabled: !canAdd }}
            disabled={!canAdd}
            onPress={add}
            style={[styles.add, { borderColor: colors.primary }, !canAdd && styles.dim]}
          >
            <Text style={[styles.addLabel, { color: colors.primary }]}>{t('sign.add')}</Text>
          </Pressable>
        ) : null}
        {full ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {t('sign.max')}
          </Text>
        ) : null}
        {placements.map((p, i) => (
          <View
            // Placements have no id; the list only appends and removes.
            key={`${i}-${p.page}-${p.signatureId}`}
            style={[styles.placed, { borderColor: colors.border }]}
          >
            <Text style={[styles.placedLabel, { color: colors.text }]}>
              {t('sign.placed', { page: p.page })}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('sign.remove', { page: p.page })}
              onPress={() => setPlacements((list) => list.filter((_, k) => k !== i))}
              style={styles.iconButton}
            >
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <RunButton
        label={t('sign.run')}
        disabled={placements.length === 0}
        onPress={() => {
          if (placements.length > 0) onRun(placements);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8 },
  scroll: { flex: 1 },
  content: { gap: 12, paddingBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  add: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.5 },
  placed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingLeft: 12,
  },
  placedLabel: { flex: 1 },
  iconButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
});
