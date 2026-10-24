import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { CompressOptions } from '@/components/tools/CompressOptions';
import { ImagesToPdfFlow } from '@/components/tools/ImagesToPdfFlow';
import { MergeOptions } from '@/components/tools/MergeOptions';
import { PickFilesList } from '@/components/tools/PickFilesList';
import { ProgressSheet } from '@/components/tools/ProgressSheet';
import { ProtectOptions } from '@/components/tools/ProtectOptions';
import { SplitOptions } from '@/components/tools/SplitOptions';
import { UnlockOptions } from '@/components/tools/UnlockOptions';
import { usePasswordPrompts } from '@/components/tools/usePasswordPrompts';
import type { FileRow } from '@/db/schema';
import { checkInputSizes } from '@/services/tools/limits';
import { pickDocuments } from '@/services/tools/pickDocuments';
import type { Passwords, PdfToolRequest, ToolRequest } from '@/services/tools/runTool';
import { knownSize } from '@/services/tools/toolFailure';
import {
  canContinue,
  initialFlow,
  parseInputsParam,
  pickCaps,
  pruneFlow,
  toggleSelection,
  type FlowState,
} from '@/services/tools/toolFlow';
import { toolById, type ToolDef } from '@/services/tools/toolRegistry';
import { useFiles } from '@/stores/filesStore';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';
import { formatBytes } from '@/utils/fileSize';

/** Leaves the tool; a deep-linked tool with nothing under it falls back to the Tools tab. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/tools');
}

export default function ToolScreen() {
  const { t } = useTranslation();
  const { toolId, inputs } = useLocalSearchParams<{ toolId: string; inputs?: string }>();
  if (toolId === 'scan') return <Redirect href="/scan" />;
  const tool = toolById(toolId ?? '');
  if (!tool || !tool.available) {
    return <EmptyState icon="toolbox-outline" title={t('placeholder.comingSoon')} />;
  }
  if (tool.id === 'images-to-pdf') return <ImagesToPdfFlow />;
  return <ToolFlow key={tool.id} tool={tool} inputIds={parseInputsParam(inputs)} />;
}

function ToolFlow({ tool, inputIds }: { tool: ToolDef; inputIds: string[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const files = useFiles((s) => s.files);
  const [stored, setStored] = useState<FlowState>(() => {
    // Only ids of known files are prefilled; a valid set that cannot run starts at pick.
    const known = useFiles.getState().getRows(inputIds);
    const first = initialFlow(
      tool,
      known.map((r) => r.id),
    );
    return first.step === 'options' && !canContinue(first, tool, known)
      ? { ...first, step: 'pick' }
      : first;
  });
  const [startedAtPick] = useState(() => stored.step === 'pick');
  // Selected files can leave the library while the flow is open: read and update a pruned flow.
  const flow = useMemo(() => pruneFlow(stored, files), [stored, files]);
  const setFlow = useCallback(
    (update: (f: FlowState) => FlowState) =>
      setStored((prev) => update(pruneFlow(prev, useFiles.getState().files))),
    [],
  );
  // One start per tap: a second press can land before the job id re-renders.
  const starting = useRef(false);
  const asking = useRef(false);
  const { dialog, ask, blocked } = usePasswordPrompts();
  const [notice, setNotice] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const active = useToolJobs((s) => s.active);
  const last = useToolJobs((s) => s.last);

  const rows = useMemo(() => {
    const byId = new Map(files.map((f) => [f.id, f]));
    return flow.selectedIds.flatMap((id) => byId.get(id) ?? []);
  }, [files, flow.selectedIds]);

  // Organise has its own page editor; one picked file goes straight there.
  const organizeId = tool.id === 'organize' && flow.step === 'options' ? rows[0]?.id : undefined;
  useEffect(() => {
    if (organizeId) router.replace({ pathname: '/tool/organize/[id]', params: { id: organizeId } });
  }, [organizeId]);

  // The job this screen started finished (done, failed or cancelled): show its result.
  const finished = jobId !== null && last?.jobId === jobId;
  useEffect(() => {
    if (finished && jobId) router.replace({ pathname: '/result', params: { jobId } });
  }, [finished, jobId]);

  const backToPick = startedAtPick && flow.step === 'options';
  useFocusEffect(
    useCallback(() => {
      if (!backToPick) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setFlow((f) => ({ ...f, step: 'pick' }));
        return true;
      });
      return () => sub.remove();
    }, [backToPick, setFlow]),
  );

  const run = (request: ToolRequest) => {
    if (starting.current) return;
    starting.current = true;
    setNotice(null);
    const result = useToolJobs.getState().start(request, t);
    if (result.ok) {
      setJobId(result.jobId);
      return;
    }
    starting.current = false;
    setNotice(t(result.reason === 'busy' ? 'toolError.busy' : 'toolError.unknown'));
  };

  // Locked inputs are asked for first; Cancel starts nothing.
  const runAsked = async (request: PdfToolRequest) => {
    if (starting.current || asking.current) return;
    asking.current = true;
    setNotice(null);
    let passwords: Passwords | null;
    try {
      // In request order: a password belongs to its input index.
      passwords = await ask(
        request.inputIds.flatMap((id) => rows.find((r) => r.id === id) ?? []),
        request.toolId,
      );
    } finally {
      asking.current = false;
    }
    if (passwords === null) return;
    run(Object.keys(passwords).length > 0 ? { ...request, passwords } : request);
  };

  const back = () => {
    setNotice(null);
    if (backToPick) setFlow((f) => ({ ...f, step: 'pick' }));
    else leave();
  };

  const running = jobId !== null && active?.jobId === jobId ? active : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      {flow.step === 'pick' ? (
        <PickStep tool={tool} flow={flow} rows={rows} setFlow={setFlow} />
      ) : (
        <View style={styles.root}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('tool.back')}
              onPress={back}
              style={styles.textButton}
            >
              <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
                {t('tool.back')}
              </Text>
            </Pressable>
            <Text accessibilityRole="header" style={[styles.toolName, { color: colors.text }]}>
              {t(tool.labelKey)}
            </Text>
          </View>
          {(notice ?? blocked) ? (
            <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
              {notice ?? blocked}
            </Text>
          ) : null}
          {tool.id === 'merge' ? (
            <MergeOptions
              rows={rows}
              onChange={(ids) => setFlow((f) => ({ ...f, selectedIds: ids }))}
              onRun={() => void runAsked({ toolId: 'merge', inputIds: rows.map((r) => r.id) })}
            />
          ) : null}
          {tool.id === 'compress' && rows[0] ? (
            <CompressOptions
              row={rows[0]}
              onRun={(level) =>
                void runAsked({ toolId: 'compress', inputIds: [rows[0]!.id], level })
              }
            />
          ) : null}
          {tool.id === 'protect' && rows[0] ? (
            <ProtectOptions
              row={rows[0]}
              onRun={(newPassword) =>
                void runAsked({ toolId: 'protect', inputIds: [rows[0]!.id], newPassword })
              }
            />
          ) : null}
          {tool.id === 'unlock' && rows[0] ? (
            <UnlockOptions
              row={rows[0]}
              onRun={() => void runAsked({ toolId: 'unlock', inputIds: [rows[0]!.id] })}
            />
          ) : null}
          {tool.id === 'split' && rows[0] ? (
            <SplitOptions
              row={rows[0]}
              onRun={(split, passwords) =>
                run({
                  toolId: 'split',
                  inputIds: [rows[0]!.id],
                  split,
                  ...(passwords ? { passwords } : {}),
                })
              }
            />
          ) : null}
        </View>
      )}
      {dialog}
      <ProgressSheet
        visible={running !== null}
        title={t(`progress.title.${tool.id}`)}
        phase={running?.phase ?? 'preparing'}
        fraction={running?.fraction ?? 0}
        onCancel={() => useToolJobs.getState().cancel()}
        onHide={leave}
      />
    </SafeAreaView>
  );
}

type PickProps = {
  tool: ToolDef;
  flow: FlowState;
  rows: FileRow[];
  setFlow(update: (f: FlowState) => FlowState): void;
};

function PickStep({ tool, flow, rows, setFlow }: PickProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const files = useFiles((s) => s.files);
  const [browseFailed, setBrowseFailed] = useState(false);
  const browsing = useRef(false);
  const multi = tool.maxInputs > 1;
  const ok = canContinue(flow, tool, rows);
  const caps = pickCaps(tool);
  const sizes = checkInputSizes(
    rows.map((r) => knownSize(r.sizeBytes)),
    caps,
  );
  const overTotal = multi && !sizes.ok && sizes.reason === 'totalTooLarge';

  const browse = async () => {
    if (browsing.current) return;
    browsing.current = true;
    setBrowseFailed(false);
    // Picked files carry a short-lived read grant: select them at once, on this screen.
    const { ids, failed } = await pickDocuments(multi);
    browsing.current = false;
    setBrowseFailed(failed > 0);
    setFlow((f) =>
      ids.reduce((s, id) => (s.selectedIds.includes(id) ? s : toggleSelection(s, id, tool)), f),
    );
  };

  const next = () => {
    if (!ok) return;
    setFlow((f) => ({ ...f, step: 'options' }));
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.back')}
          onPress={leave}
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>{t('tool.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={[styles.toolName, { color: colors.text }]}>
          {t(multi ? 'tool.pickTitle' : 'tool.pickOne')}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted }}>
        {multi ? t('tool.pickHintMerge') : t(tool.descriptionKey)}
      </Text>
      {/* Single-input tools replace the selection on tap, so no row is ever "full". */}
      <PickFilesList
        files={files}
        selectedIds={flow.selectedIds}
        max={multi ? tool.maxInputs : Number.POSITIVE_INFINITY}
        maxFileBytes={caps.file}
        onToggle={(id) => setFlow((f) => toggleSelection(f, id, tool))}
      />
      {browseFailed ? <Text style={{ color: colors.danger }}>{t('tool.browseFailed')}</Text> : null}
      {overTotal ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {t('toolError.totalTooLarge', { limit: formatBytes(caps.total) })}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.browse')}
          onPress={() => void browse()}
          style={styles.textButton}
        >
          <Text style={[styles.textButtonLabel, { color: colors.primary }]}>
            {t('tool.browse')}
          </Text>
        </Pressable>
        {multi ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.count, { color: colors.textMuted }]}
          >
            {t('tool.selectedCount', { count: flow.selectedIds.length })}
          </Text>
        ) : (
          <View style={styles.count} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tool.next')}
          accessibilityState={{ disabled: !ok }}
          disabled={!ok}
          onPress={next}
          style={[styles.next, { backgroundColor: colors.primary }, !ok && styles.dim]}
        >
          <Text style={[styles.textButtonLabel, { color: colors.onPrimary }]}>
            {t('tool.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  root: { flex: 1, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolName: { flex: 1, fontSize: 20, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { flex: 1, textAlign: 'center' },
  textButton: { minHeight: 48, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' },
  textButtonLabel: { fontSize: 16, fontWeight: '600' },
  next: {
    minHeight: 48,
    minWidth: 96,
    borderRadius: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.5 },
});
