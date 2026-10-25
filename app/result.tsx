import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/EmptyState';
import { OutputRow } from '@/components/tools/OutputRow';
import { SavedImagesCard } from '@/components/tools/SavedImagesCard';
import { SizeChange } from '@/components/tools/SizeChange';
import type { FileRow } from '@/db/schema';
import { interstitial } from '@/services/ads/interstitial';
import { reviewPrompt } from '@/services/review/reviewPrompt';
import { jobFailureMessage } from '@/services/tools/failureMessage';
import { useFiles } from '@/stores/filesStore';
import { useToolJobs } from '@/stores/toolJobStore';
import { useTheme } from '@/theme/useTheme';
import { fileActionErrorKey } from '@/utils/fileActionError';

const NOTICE_MS = 4000;
const REVIEW_ASK_TIMEOUT_MS = 3000;

const RETRY_FAILED = {
  busy: 'toolError.busy',
  // An image job from before a restart: its images were cleaned up at start.
  gone: 'toolError.imagesGone',
  db: 'toolError.unknown',
  // A password tool's row from before: the password is never stored.
  needsInput: 'toolError.needsInput',
} as const;

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** Done / Close: the user is finished with this job (a failed image job's session goes away). */
function dismissAndLeave(jobId: string) {
  useToolJobs.getState().dismiss(jobId);
  leave();
}

export default function ResultScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { jobId: param } = useLocalSearchParams<{ jobId?: string }>();
  const jobId = typeof param === 'string' ? param : '';
  // Re-render when the job store or the file rows change.
  useToolJobs((s) => s.active);
  useToolJobs((s) => s.last);
  useFiles((s) => s.files);
  const view = useToolJobs.getState().outcomeOf(jobId);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryFailed, setRetryFailed] = useState<string | null>(null);
  // A compressed file that is not smaller: the user deletes it or keeps both.
  const [notSmaller, setNotSmaller] = useState<'ask' | 'kept' | 'deleted'>('ask');
  const deleting = useRef(false);
  const reviewing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Also when a running job finishes while this screen is open (markSeen ignores active jobs).
  const viewKind = view.kind;
  useEffect(() => {
    if (jobId && viewKind === 'done') useToolJobs.getState().markSeen(jobId);
  }, [jobId, viewKind]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const deleteNew = async (outputId: string) => {
    if (deleting.current) return;
    deleting.current = true;
    const error = await useFiles.getState().remove(outputId);
    deleting.current = false;
    if (error) setNotice(fileActionErrorKey(error));
    else setNotSmaller('deleted');
  };

  // Done on a success: the review ask (once per install) comes before leaving; a tap while it is
  // pending is ignored.
  const finish = async () => {
    if (reviewing.current) return;
    reviewing.current = true;
    try {
      // A review dialog that never settles must not trap the user on this screen.
      if (reviewPrompt.shouldAsk()) {
        await Promise.race([
          reviewPrompt.ask(),
          new Promise<void>((resolve) => setTimeout(resolve, REVIEW_ASK_TIMEOUT_MS)),
        ]);
      }
    } finally {
      reviewing.current = false;
    }
    if (!mounted.current) return;
    dismissAndLeave(jobId);
    interstitial.showAfterDone();
  };

  const retry = () => {
    const result = useToolJobs.getState().retry(jobId, t);
    setRetryFailed(result.ok ? null : RETRY_FAILED[result.reason]);
    if (result.ok) router.setParams({ jobId: result.jobId });
  };

  const header = (title: string) => (
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
      {title}
    </Text>
  );
  const outputs = (files: FileRow[]) =>
    files.map((f) => <OutputRow key={f.id} file={f} onNotice={setNotice} />);
  const button = (label: string, onPress: () => void, color: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.button}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );

  let body;
  if (view.kind === 'missing') {
    body = <EmptyState title={t('result.notFoundJob')} />;
  } else if (view.kind === 'running') {
    const percent = Math.round(Math.min(1, Math.max(0, view.job.fraction || 0)) * 100);
    body = (
      <View style={styles.section}>
        {header(t(`progress.title.${view.job.toolId}`))}
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t(`progress.title.${view.job.toolId}`)}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={[styles.track, { backgroundColor: colors.surface }]}
        >
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
        </View>
        <View style={styles.spread}>
          <Text style={{ color: colors.textMuted }}>{t(`progress.${view.job.phase}`)}</Text>
          <Text style={{ color: colors.text }}>{t('progress.percent', { percent })}</Text>
        </View>
        <View style={styles.actions}>
          {button(
            t('progress.cancel'),
            () => {
              if (useToolJobs.getState().active?.jobId === jobId) useToolJobs.getState().cancel();
            },
            colors.danger,
          )}
        </View>
      </View>
    );
  } else if (view.outcome.ok) {
    const sizes = view.outcome.extras?.sizes;
    const asking = sizes !== undefined && sizes.after >= sizes.before && notSmaller === 'ask';
    const deleted = sizes !== undefined && notSmaller === 'deleted';
    const firstOutput = view.outcome.outputs[0];
    // PDF to images saves gallery images (no PDF, so no "new file has no password" note).
    const images = view.outcome.extras?.images;
    body = (
      <View style={styles.section}>
        {header(t('result.successTitle'))}
        {images ? (
          <SavedImagesCard images={images} onNotice={setNotice} />
        ) : (
          <Text style={{ color: colors.textMuted }}>{t('result.savedTo')}</Text>
        )}
        {view.outcome.extras?.passwordRemoved && !images ? (
          <Text style={{ color: colors.text }}>{t('result.passwordRemoved')}</Text>
        ) : null}
        {sizes && (sizes.after < sizes.before || asking) ? (
          <SizeChange before={sizes.before} after={sizes.after} />
        ) : null}
        {asking && firstOutput ? (
          <View style={styles.actions}>
            {/* Inline (not button()): its handler reads a ref, so it must stay an event prop. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('compress.deleteNew')}
              onPress={() => void deleteNew(firstOutput.id)}
              style={styles.button}
            >
              <Text style={[styles.buttonText, { color: colors.danger }]}>
                {t('compress.deleteNew')}
              </Text>
            </Pressable>
            {button(t('compress.keepBoth'), () => setNotSmaller('kept'), colors.primary)}
          </View>
        ) : null}
        {deleted ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
            {t('compress.deleted')}
          </Text>
        ) : (
          outputs(view.outcome.outputs)
        )}
        <View style={styles.actions}>
          {/* Inline (not button()): its handler reads a ref, so it must stay an event prop. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('result.done')}
            onPress={() => void finish()}
            style={styles.button}
          >
            <Text style={[styles.buttonText, { color: colors.primary }]}>{t('result.done')}</Text>
          </Pressable>
        </View>
      </View>
    );
  } else {
    const { failure, inputIndex, outputs: partial } = view.outcome;
    const savedImages = view.outcome.extras?.images;
    body = (
      <View style={styles.section}>
        {header(t('result.failedTitle'))}
        <Text style={{ color: colors.danger }}>
          {jobFailureMessage(
            failure,
            useToolJobs.getState().inputNameOf(jobId, inputIndex),
            partial.length,
            t,
            view.toolId,
          )}
        </Text>
        {retryFailed !== null ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {t(retryFailed)}
          </Text>
        ) : null}
        {savedImages && savedImages.count > 0 ? (
          <SavedImagesCard images={savedImages} onNotice={setNotice} />
        ) : null}
        {partial.length > 0 ? (
          <>
            <Text style={{ color: colors.text }}>{t('result.partial')}</Text>
            {/* Parts already saved from a locked input have no password either. */}
            {view.outcome.extras?.passwordRemoved ? (
              <Text style={{ color: colors.text }}>{t('result.passwordRemoved')}</Text>
            ) : null}
            {outputs(partial)}
          </>
        ) : null}
        <View style={styles.actions}>
          {button(t('result.retry'), retry, colors.primary)}
          {button(t('result.close'), () => dismissAndLeave(jobId), colors.textMuted)}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.notice, { backgroundColor: colors.surface, color: colors.text }]}
        >
          {t(notice)}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, flexGrow: 1 },
  section: { gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  spread: { flexDirection: 'row', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 12, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  notice: { margin: 16, padding: 12, borderRadius: 8, overflow: 'hidden' },
});
