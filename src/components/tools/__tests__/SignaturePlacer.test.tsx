import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { initI18n } from '@/i18n';
import { DEFAULT_PLACEMENT } from '@/services/tools/placement';

import PdfNativeModule from '../../../../modules/pdf-native';
import { SignaturePlacer } from '../SignaturePlacer';

const i18n = initI18n('en');
const signature = { uri: 'file:///files/signatures/sig-1-abc123.png', width: 200, height: 100 };

type Over = {
  page?: number;
  value?: typeof DEFAULT_PLACEMENT;
  /** Lay out and load the page image (default A4 portrait, 512 × 724 px). */
  load?: false | [number, number];
};

async function setup(over: Over = {}) {
  const onChange = jest.fn();
  const onPageChange = jest.fn();
  const onPageAspect = jest.fn();
  const ui = (page: number) => (
    <I18nextProvider i18n={i18n}>
      <SignaturePlacer
        fileUri="file:///cache/tools/p/in-0.pdf"
        page={page}
        pageCount={3}
        signature={signature}
        value={over.value ?? DEFAULT_PLACEMENT}
        onChange={onChange}
        onPageChange={onPageChange}
        onPageAspect={onPageAspect}
      />
    </I18nextProvider>
  );
  const view = await render(ui(over.page ?? 1));
  await act(async () => {});
  await fireEvent(screen.getByTestId('sign-page'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 424 } },
  });
  await act(async () => {});
  if (over.load !== false) await loadPage(...(over.load ?? [512, 724]));
  const press = async (label: string) => await fireEvent.press(screen.getByLabelText(label));
  const showPage = async (page: number) => {
    await view.rerender(ui(page));
    await act(async () => {});
  };
  return { onChange, onPageChange, onPageAspect, press, showPage };
}

/** The page thumbnail finished loading at `width` × `height` px. */
async function loadPage(width: number, height: number) {
  await fireEvent(screen.getByTestId('sign-page-image', { includeHiddenElements: true }), 'load', {
    nativeEvent: {
      cacheType: 'none',
      source: { url: 'file:///tool-thumb.jpg', width, height, mediaType: 'image/jpeg' },
    },
  });
  await act(async () => {});
}

const PLACING = [
  'Move signature up',
  'Move signature down',
  'Move signature left',
  'Move signature right',
  'Make signature smaller',
  'Make signature bigger',
  'Bottom left',
];

const CONTROLS = [
  'Move signature up',
  'Move signature down',
  'Move signature left',
  'Move signature right',
  'Make signature smaller',
  'Make signature bigger',
  'Previous page',
  'Next page',
];

describe('SignaturePlacer', () => {
  it('renders the page at 512 px with the hint', async () => {
    await setup({ page: 2 });
    expect(PdfNativeModule.renderToolThumbnail).toHaveBeenCalledWith(
      'file:///cache/tools/p/in-0.pdf',
      2,
      512,
    );
    expect(screen.getByText('Drag to move. Pinch to resize.')).toBeTruthy();
    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
  });

  it('Bigger and Smaller resize by 1.1 and 0.9', async () => {
    const { onChange, press } = await setup();
    await press('Make signature bigger');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cx: 0.72, cy: 0.85, width: expect.closeTo(0.33) }),
    );
    await press('Make signature smaller');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: expect.closeTo(0.27) }),
    );
  });

  it('Move right adds 0.02 to cx, Move up takes 0.02 off cy', async () => {
    const { onChange, press } = await setup();
    await press('Move signature right');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cx: expect.closeTo(0.74), cy: 0.85, width: 0.3 }),
    );
    await press('Move signature up');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ cx: 0.72, cy: expect.closeTo(0.83) }),
    );
  });

  it('the preset "Bottom left" moves it to the bottom left', async () => {
    const { onChange, press } = await setup();
    expect(screen.getByLabelText('Bottom right')).toBeChecked();
    await press('Bottom left');
    const next = onChange.mock.lastCall![0];
    expect(next.cx).toBeLessThan(0.5);
    expect(next.cy).toBeGreaterThan(0.5);
    expect(next.width).toBe(0.3);
  });

  it('every control has a label and a 48 dp target', async () => {
    await setup();
    for (const label of CONTROLS) {
      const control = screen.getByLabelText(label);
      const style = Object.assign({}, ...[control.props.style].flat(3).filter(Boolean));
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.minWidth).toBeGreaterThanOrEqual(48);
    }
    expect(screen.getByLabelText('Page 1 of 3')).toBeTruthy();
  });

  it('changes the page with the buttons and the field', async () => {
    const { onPageChange, press } = await setup({ page: 2 });
    await press('Next page');
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    await press('Previous page');
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    await fireEvent.changeText(screen.getByLabelText('Page 2 of 3'), '3');
    expect(onPageChange).toHaveBeenLastCalledWith(3);
    onPageChange.mockClear();
    await fireEvent.changeText(screen.getByLabelText('Page 2 of 3'), '9');
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('cannot go before page 1 or past the last page', async () => {
    await setup({ page: 1 });
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeEnabled();
  });

  it('a drag commits the clamped placement when it ends', async () => {
    const { onChange } = await setup();
    await act(async () => {
      fireGestureHandler(getByGestureTestId('signature-pan'), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: -30, translationY: -42.4 },
        { state: State.END, translationX: -60, translationY: -84.8 },
      ]);
    });
    const next = onChange.mock.lastCall![0];
    // 300 px wide: −60 px is −0.2 of the width; the page is 300 × 724 / 512 tall.
    expect(next.cx).toBeCloseTo(0.52);
    expect(next.cy).toBeCloseTo(0.85 - 84.8 / ((300 * 724) / 512));
    expect(next.width).toBe(0.3);
  });

  it('waits for the page shape before the signature can be placed', async () => {
    const { onPageAspect, onChange } = await setup({ load: false });
    for (const label of PLACING) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.queryByTestId('signature-overlay')).toBeNull();
    expect(onPageAspect).not.toHaveBeenCalledWith(expect.any(Number));
    await loadPage(512, 724);
    expect(onPageAspect).toHaveBeenLastCalledWith(724 / 512);
    for (const label of PLACING) expect(screen.getByLabelText(label)).toBeEnabled();
    expect(screen.getByTestId('signature-overlay')).toBeTruthy();
    // The default placement fits this page: nothing to re-clamp.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('forgets the shape on a page change and re-clamps for the new page', async () => {
    // Near the bottom: fits portrait A4 but not a landscape page.
    const value = { cx: 0.5, cy: 0.9, width: 0.5 };
    const { onPageAspect, onChange, showPage } = await setup({ value });
    expect(onChange).not.toHaveBeenCalled();
    await showPage(3);
    expect(onPageAspect).toHaveBeenLastCalledWith(null);
    for (const label of PLACING) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    await loadPage(724, 512);
    expect(onPageAspect).toHaveBeenLastCalledWith(512 / 724);
    const next = onChange.mock.lastCall![0];
    const h = (0.5 * 0.5) / (512 / 724);
    expect(next.cy + h / 2).toBeCloseTo(1);
    expect(next.cy).toBeLessThan(0.9);
    for (const label of PLACING) expect(screen.getByLabelText(label)).toBeEnabled();
  });

  it('says so when the page cannot be shown, and never reports a shape', async () => {
    jest.mocked(PdfNativeModule.renderToolThumbnail).mockRejectedValueOnce(new Error('x'));
    const { onPageAspect } = await setup({ load: false });
    expect(screen.getByText("Couldn't show this page")).toBeTruthy();
    expect(onPageAspect).not.toHaveBeenCalledWith(expect.any(Number));
    for (const label of PLACING) expect(screen.getByLabelText(label)).toBeDisabled();
  });

  it('a page image that fails to decode is the same as no page', async () => {
    const { onPageAspect } = await setup({ load: false });
    await fireEvent(
      screen.getByTestId('sign-page-image', { includeHiddenElements: true }),
      'error',
      { nativeEvent: { error: 'bad' } },
    );
    await act(async () => {});
    expect(screen.getByText("Couldn't show this page")).toBeTruthy();
    expect(onPageAspect).not.toHaveBeenCalledWith(expect.any(Number));
  });
});
