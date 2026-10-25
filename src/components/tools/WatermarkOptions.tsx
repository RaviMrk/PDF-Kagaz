import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { ChoiceChips } from '@/components/ChoiceChips';
import { PageScopeField } from '@/components/tools/PageScopeField';
import { PositionGrid } from '@/components/tools/PositionGrid';
import { RunButton } from '@/components/tools/RunButton';
import { useToolPreview } from '@/components/tools/useToolPreview';
import type { FileRow } from '@/db/schema';
import { failureMessage } from '@/services/tools/failureMessage';
import {
  addPickedImages,
  discardImageSession,
  imageThumbnail,
  newImageSessionId,
  openImageSession,
} from '@/services/tools/imageSession';
import { IMAGES_MAX } from '@/services/tools/limits';
import type {
  Passwords,
  StampPosition,
  WatermarkOptions as Watermark,
} from '@/services/tools/runTool';
import { useTheme } from '@/theme/useTheme';

/**
 * `passwords` is set when the file is locked: the password that opened its preview. Returns false
 * when no job started (the chosen image's session is then still this step's to delete).
 */
type Props = { row: FileRow; onRun(opts: Watermark, passwords?: Passwords): boolean | void };

type Source = Watermark['source']['kind'];
type Color = Extract<Watermark['source'], { kind: 'text' }>['color'];
type OpacityKey = '20' | '35' | '50' | '80';
type AngleKey = `${Watermark['angle']}`;
type Size = Watermark['size'];

const TEXT_MAX = 60;
const COLORS: readonly Color[] = ['grey', 'red', 'blue'];
const OPACITIES: readonly OpacityKey[] = ['20', '35', '50', '80'];
const ANGLES: readonly AngleKey[] = ['0', '45', '90', '-45'];
const SIZES: readonly Size[] = ['small', 'medium', 'large'];
const THUMB_DP = 96;

/** Add watermark options; the staged preview gives the page count (and asks a locked file's password). */
export function WatermarkOptions({ row, onRun }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state: loaded, password, dialog } = useToolPreview(row, 'watermark');

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
    <WatermarkForm
      pageCount={loaded.pageCount}
      onRun={(opts) => (password === null ? onRun(opts) : onRun(opts, { 0: password }))}
    />
  );
}

type Picked = { index: number; thumb: string | null };

/**
 * The image session behind Choose image: opened at the first pick, one image per pick. It is
 * deleted when the step goes away, unless a job took it over.
 */
function useWatermarkImage() {
  const { t } = useTranslation();
  const [sessionId] = useState(() => newImageSessionId());
  const [image, setImage] = useState<Picked | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const opened = useRef(false);
  const started = useRef(false);
  const busy = useRef(false);
  const alive = useRef(true);
  const nextIndex = useRef(0);

  const drop = () => {
    if (!opened.current || started.current) return;
    opened.current = false;
    discardImageSession(sessionId);
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      drop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async () => {
    if (busy.current) return;
    busy.current = true;
    setPicking(true);
    setNotice(null);
    try {
      if (!opened.current) {
        opened.current = await openImageSession(sessionId);
        if (!opened.current) {
          if (alive.current) setNotice(t('toolError.unknown'));
          return;
        }
      }
      // One image: the picker offers what is left of the session's capacity after IMAGES_MAX − 1.
      const result = await addPickedImages(sessionId, nextIndex.current, IMAGES_MAX - 1);
      // Left while picking: the files landed after the session was deleted.
      if (!alive.current) {
        drop();
        return;
      }
      const item = result.items[0];
      if (item) {
        nextIndex.current = item.index + 1;
        const px = Math.round(THUMB_DP * PixelRatio.get());
        const thumb = await imageThumbnail(sessionId, item.index, px, 'colour');
        if (alive.current) setImage({ index: item.index, thumb });
      } else if (result.failed > 0) {
        setNotice(t('images.addFailed', { count: result.failed }));
      }
    } finally {
      busy.current = false;
      if (alive.current) setPicking(false);
    }
  };

  return {
    sessionId,
    image,
    notice,
    picking,
    choose,
    /** A job now owns the session (or, without an image, it is no longer needed). */
    handOver(usesImage: boolean) {
      if (usesImage) started.current = true;
      else {
        drop();
        setImage(null);
      }
    },
    /** The job did not start: the session is this step's again. */
    takeBack() {
      started.current = false;
    },
  };
}

type FormProps = { pageCount: number; onRun(opts: Watermark): boolean | void };

function WatermarkForm({ pageCount, onRun }: FormProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const picker = useWatermarkImage();
  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [color, setColor] = useState<Color>('grey');
  const [opacity, setOpacity] = useState<OpacityKey>('35');
  const [angle, setAngle] = useState<AngleKey>('45');
  const [size, setSize] = useState<Size>('medium');
  const [position, setPosition] = useState<StampPosition>('center');
  const [pages, setPages] = useState<number[] | null>(null);

  const trimmed = text.trim();
  const sourceReady = source === 'text' ? trimmed !== '' : picker.image !== null;
  const pagesReady = pages === null || pages.length > 0;
  const ready = sourceReady && pagesReady && !picker.picking;

  const label = (key: string) => (
    <Text style={[styles.label, { color: colors.text }]}>{t(key)}</Text>
  );

  const run = () => {
    if (!ready) return;
    const opts: Watermark = {
      source:
        source === 'text' || picker.image === null
          ? { kind: 'text', text: trimmed, color }
          : { kind: 'image', sessionId: picker.sessionId, index: picker.image.index },
      opacity: Number(opacity) / 100,
      angle: Number(angle) as Watermark['angle'],
      size,
      position,
      pages: pages === null ? null : [...pages],
    };
    const usesImage = opts.source.kind === 'image';
    picker.handOver(usesImage);
    if (onRun(opts) === false && usesImage) picker.takeBack();
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {label('watermark.source')}
        <ChoiceChips<Source>
          label={t('watermark.source')}
          options={[
            { key: 'text', label: t('watermark.text') },
            { key: 'image', label: t('watermark.image') },
          ]}
          value={source}
          onChange={setSource}
        />
        {source === 'text' ? (
          <>
            {label('watermark.textLabel')}
            <TextInput
              accessibilityLabel={t('watermark.textLabel')}
              value={text}
              onChangeText={setText}
              maxLength={TEXT_MAX}
              autoCorrect={false}
              style={[
                styles.input,
                { color: colors.text, borderColor: trimmed === '' ? colors.danger : colors.border },
              ]}
            />
            {trimmed === '' ? (
              <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
                {t('watermark.textRequired')}
              </Text>
            ) : null}
            {label('watermark.color')}
            <ChoiceChips<Color>
              label={t('watermark.color')}
              options={COLORS.map((key) => ({ key, label: t(`watermark.${key}`) }))}
              value={color}
              onChange={setColor}
            />
          </>
        ) : (
          <View style={styles.imageRow}>
            {picker.image?.thumb ? (
              <Image
                testID="watermark-thumb"
                source={{ uri: picker.image.thumb }}
                style={[styles.thumb, { backgroundColor: colors.surface }]}
                contentFit="contain"
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(
                picker.image ? 'watermark.changeImage' : 'watermark.chooseImage',
              )}
              accessibilityState={{ disabled: picker.picking }}
              disabled={picker.picking}
              onPress={() => void picker.choose()}
              style={[styles.choose, { borderColor: colors.primary }]}
            >
              <Text style={[styles.chooseLabel, { color: colors.primary }]}>
                {t(picker.image ? 'watermark.changeImage' : 'watermark.chooseImage')}
              </Text>
            </Pressable>
          </View>
        )}
        {source === 'image' && picker.notice ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
            {picker.notice}
          </Text>
        ) : null}
        {label('watermark.opacity')}
        <ChoiceChips<OpacityKey>
          label={t('watermark.opacity')}
          options={OPACITIES.map((key) => ({
            key,
            label: t('watermark.opacityValue', { percent: Number(key) }),
          }))}
          value={opacity}
          onChange={setOpacity}
        />
        {label('watermark.angle')}
        <ChoiceChips<AngleKey>
          label={t('watermark.angle')}
          options={ANGLES.map((key) => ({
            key,
            label: t('watermark.angleValue', { deg: Number(key) }),
          }))}
          value={angle}
          onChange={setAngle}
        />
        {label('watermark.size')}
        <ChoiceChips<Size>
          label={t('watermark.size')}
          options={SIZES.map((key) => ({ key, label: t(`watermark.${key}`) }))}
          value={size}
          onChange={setSize}
        />
        {label('position.label')}
        <PositionGrid label={t('position.label')} value={position} onChange={setPosition} />
        <PageScopeField pageCount={pageCount} value={pages} onChange={setPages} />
      </ScrollView>
      <RunButton label={t('watermark.run')} disabled={!ready} onPress={run} />
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
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: THUMB_DP, height: THUMB_DP, borderRadius: 8 },
  choose: {
    minHeight: 48,
    minWidth: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseLabel: { fontSize: 16, fontWeight: '600' },
});
