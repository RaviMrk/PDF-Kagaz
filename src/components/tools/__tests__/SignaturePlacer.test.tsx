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

async function setup(over: { page?: number; value?: typeof DEFAULT_PLACEMENT } = {}) {
  const onChange = jest.fn();
  const onPageChange = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <SignaturePlacer
        fileUri="file:///cache/tools/p/in-0.pdf"
        page={over.page ?? 1}
        pageCount={3}
        signature={signature}
        value={over.value ?? DEFAULT_PLACEMENT}
        onChange={onChange}
        onPageChange={onPageChange}
      />
    </I18nextProvider>,
  );
  await act(async () => {});
  const press = async (label: string) => await fireEvent.press(screen.getByLabelText(label));
  return { onChange, onPageChange, press };
}

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
    await fireEvent(screen.getByTestId('sign-page'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 424 } },
    });
    await act(async () => {
      fireGestureHandler(getByGestureTestId('signature-pan'), [
        { state: State.BEGAN, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, translationX: -30, translationY: -42.4 },
        { state: State.END, translationX: -60, translationY: -84.8 },
      ]);
    });
    const next = onChange.mock.lastCall![0];
    // 300 px wide: −60 px is −0.2 of the width; the page is 300 × 1.414 tall (default aspect).
    expect(next.cx).toBeCloseTo(0.52);
    expect(next.cy).toBeCloseTo(0.85 - 84.8 / (300 * 1.414));
    expect(next.width).toBe(0.3);
  });
});
