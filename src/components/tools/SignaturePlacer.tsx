import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { PositionGrid } from '@/components/tools/PositionGrid';
import {
  clampPlacement,
  nudge,
  positionOf,
  presetPlacement,
  resize,
  type Placement,
} from '@/services/tools/placement';
import { createToolThumbLoader } from '@/services/tools/toolThumbs';
import { useTheme } from '@/theme/useTheme';
import { toAsciiDigits } from '@/utils/digits';

type Props = {
  /** The staged input (tool workspace file). */
  fileUri: string;
  /** 1-based page shown. */
  page: number;
  pageCount: number;
  /** The signature PNG and its pixel size. */
  signature: { uri: string; width: number; height: number };
  value: Placement;
  onChange(next: Placement): void;
  onPageChange(page: number): void;
  /** h / w of the page shown, once its image has loaded; null until then or when it failed. */
  onPageAspect(aspect: number | null): void;
};

/** The rendered page width (px; the tool lane's maximum). */
const PAGE_PX = 512;
/** The page preview is never taller than this (dp), so the controls stay in reach. */
const MAX_PAGE_DP = 480;
/** The preview frame's shape until the page image tells its real one (nothing is placed meanwhile). */
const DEFAULT_PAGE_ASPECT = 1.414;
/** Paper colour behind the page and signature (signatures are dark ink on transparency). */
const PAPER = '#ffffff';

const same = (a: Placement, b: Placement) => a.cx === b.cx && a.cy === b.cy && a.width === b.width;

/**
 * One page with the signature over it at `value`: drag moves it, pinch resizes it (both committed
 * clamped when the gesture ends), and buttons do the same for TalkBack and precise moves.
 */
export function SignaturePlacer({
  fileUri,
  page,
  pageCount,
  signature,
  value,
  onChange,
  onPageChange,
  onPageAspect,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const loader = useMemo(() => createToolThumbLoader(fileUri, PAGE_PX), [fileUri]);
  useEffect(() => () => loader.cancelPending(), [loader]);
  const [image, setImage] = useState<{ page: number; uri: string | null } | null>(null);
  // The shape of the page whose image loaded; another page's shape is never used.
  const [shape, setShape] = useState<{ page: number; aspect: number } | null>(null);
  const [broken, setBroken] = useState<number | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const aspect =
    signature.width > 0 && signature.height > 0 ? signature.height / signature.width : 1;

  useEffect(() => {
    let alive = true;
    loader.request(page, (uri) => {
      if (alive) setImage({ page, uri });
    });
    return () => {
      alive = false;
    };
  }, [loader, page]);
  const pageUri = image?.page === page ? image.uri : loader.get(page);
  const failed = pageUri === null || broken === page;
  /** The shown page's shape; null until its image loaded (placing waits for it). */
  const pageAspect = shape?.page === page && !failed ? shape.aspect : null;
  const ready = pageAspect !== null;
  const frameAspect = pageAspect ?? DEFAULT_PAGE_ASPECT;

  const report = useEffectEvent((a: number | null) => onPageAspect(a));
  useEffect(() => report(pageAspect), [pageAspect]);

  // A new page shape or signature: the placement is clamped to it again.
  const reclamp = useEffectEvent((a: number) => {
    const next = clampPlacement(value, aspect, a);
    if (!same(next, value)) onChange(next);
  });
  useEffect(() => {
    if (pageAspect !== null) reclamp(pageAspect);
  }, [aspect, pageAspect]);

  const pageW = Math.min(stageWidth, MAX_PAGE_DP / frameAspect);
  const pageH = pageW * frameAspect;
  const sigW = value.width * pageW;
  const sigH = sigW * aspect;

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  // The committed placement is on screen: the gesture offsets go back to rest.
  useLayoutEffect(() => resetOffsets({ tx, ty, scale }), [value, tx, ty, scale]);

  const commit = (next: Placement) => {
    if (pageAspect === null) return;
    const clamped = clampPlacement(next, aspect, pageAspect);
    if (same(clamped, value)) resetOffsets({ tx, ty, scale });
    else onChange(clamped);
  };

  const gesture = useMemo(
    () =>
      placementGesture({ tx, ty, scale }, (dx, dy, factor) => {
        if (pageW <= 0) return;
        commit({
          cx: value.cx + dx / pageW,
          cy: value.cy + dy / pageH,
          width: value.width * factor,
        });
      }),
    // commit reads the value and sizes listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [value, pageW, pageH, aspect, pageAspect, tx, ty, scale],
  );

  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const control = (label: string, icon: IconName, onPress: () => void, disabled = !ready) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.control, { borderColor: colors.border }, disabled && styles.dim]}
    >
      <MaterialCommunityIcons name={icon} size={24} color={colors.text} />
    </Pressable>
  );

  const pageLabel = t('sign.page', { page, count: pageCount });

  return (
    <View style={styles.root}>
      <Text style={{ color: colors.textMuted }}>{t('sign.dragHint')}</Text>
      <View
        testID="sign-page"
        onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}
        style={styles.stage}
      >
        {pageW > 0 ? (
          <View style={[styles.page, { width: pageW, height: pageH, borderColor: colors.border }]}>
            {pageUri && !failed ? (
              <Image
                // A new page is a new image: its load always reports that page's shape.
                key={page}
                testID="sign-page-image"
                source={{ uri: pageUri }}
                style={StyleSheet.absoluteFill}
                contentFit="fill"
                accessibilityElementsHidden
                importantForAccessibility="no"
                onLoad={(e) => {
                  const { width, height } = e.source;
                  if (width > 0 && height > 0) setShape({ page, aspect: height / width });
                  else setBroken(page);
                }}
                onError={() => setBroken(page)}
              />
            ) : null}
            {failed ? (
              <View style={styles.failed}>
                <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
                  {t('sign.pageFailed')}
                </Text>
              </View>
            ) : null}
            {ready ? (
              <GestureDetector gesture={gesture}>
                <Animated.View
                  testID="signature-overlay"
                  hitSlop={16}
                  style={[
                    styles.signature,
                    {
                      left: value.cx * pageW - sigW / 2,
                      top: value.cy * pageH - sigH / 2,
                      width: sigW,
                      height: sigH,
                      borderColor: colors.primary,
                    },
                    moving,
                  ]}
                >
                  <Image
                    source={{ uri: signature.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </Animated.View>
              </GestureDetector>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.row}>
        {control(t('sign.moveLeft'), 'arrow-left', () => commit(nudge(value, 'left')))}
        {control(t('sign.moveUp'), 'arrow-up', () => commit(nudge(value, 'up')))}
        {control(t('sign.moveDown'), 'arrow-down', () => commit(nudge(value, 'down')))}
        {control(t('sign.moveRight'), 'arrow-right', () => commit(nudge(value, 'right')))}
        {control(t('sign.smaller'), 'minus', () => commit(resize(value, 0.9)))}
        {control(t('sign.bigger'), 'plus', () => commit(resize(value, 1.1)))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{t('position.label')}</Text>
      <PositionGrid
        label={t('position.label')}
        value={positionOf(value)}
        disabled={!ready}
        onChange={(position) => {
          if (pageAspect !== null) commit(presetPlacement(position, value, aspect, pageAspect));
        }}
      />
      <View style={styles.row}>
        {control(t('sign.prevPage'), 'chevron-left', () => onPageChange(page - 1), page <= 1)}
        <PageField
          key={page}
          page={page}
          pageCount={pageCount}
          label={pageLabel}
          onChange={onPageChange}
        />
        <Text style={[styles.pageText, { color: colors.text }]}>{pageLabel}</Text>
        {control(
          t('sign.nextPage'),
          'chevron-right',
          () => onPageChange(page + 1),
          page >= pageCount,
        )}
      </View>
    </View>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type Offsets = { tx: SharedValue<number>; ty: SharedValue<number>; scale: SharedValue<number> };

function resetOffsets({ tx, ty, scale }: Offsets) {
  tx.value = 0;
  ty.value = 0;
  scale.value = 1;
}

/**
 * Drag (translation in px) and pinch (scale) together on the signature, shown live through the
 * shared values; `onEnd(dx, dy, scale)` once both have ended.
 */
function placementGesture(
  offsets: Offsets,
  onEnd: (dx: number, dy: number, scale: number) => void,
) {
  const { tx, ty, scale } = offsets;
  let active = 0;
  const started = () => {
    active += 1;
  };
  const ended = () => {
    active = Math.max(0, active - 1);
    if (active === 0) onEnd(tx.value, ty.value, scale.value);
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .withTestId('signature-pan')
    .minDistance(0)
    .onStart(started)
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
      ended();
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .withTestId('signature-pinch')
    .onStart(started)
    .onUpdate((e) => {
      scale.value = e.scale;
    })
    .onEnd((e) => {
      scale.value = e.scale;
      ended();
    });
  return Gesture.Simultaneous(pan, pinch);
}

/** The page number as typed (any digits); a page in range is taken at once. */
function PageField({
  page,
  pageCount,
  label,
  onChange,
}: {
  page: number;
  pageCount: number;
  label: string;
  onChange(page: number): void;
}) {
  const { colors } = useTheme();
  // Keyed by page: a page changed elsewhere starts the field again.
  const [text, setText] = useState(String(page));
  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={(next) => {
        setText(next);
        const ascii = toAsciiDigits(next.trim());
        if (!/^\d{1,5}$/.test(ascii)) return;
        const n = Number(ascii);
        if (n >= 1 && n <= pageCount && n !== page) onChange(n);
      }}
      onBlur={() => setText(String(page))}
      keyboardType="number-pad"
      maxLength={5}
      style={[styles.pageInput, { color: colors.text, borderColor: colors.border }]}
    />
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  stage: { width: '100%', alignItems: 'center' },
  page: { backgroundColor: PAPER, borderWidth: 1, overflow: 'hidden' },
  signature: { position: 'absolute', borderWidth: 1, borderStyle: 'dashed' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  control: {
    minWidth: 48,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.4 },
  label: { fontWeight: '600' },
  pageInput: {
    minHeight: 48,
    minWidth: 64,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  pageText: { flexShrink: 1 },
  failed: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});
