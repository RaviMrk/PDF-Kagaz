import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { initI18n } from '@/i18n';
import { openToolPreview } from '@/services/tools/toolPreview';
import { makeRow } from '@/test-utils/fileRows';

import { WatermarkOptions } from '../WatermarkOptions';

jest.mock('@/services/tools/toolPreview', () => ({ openToolPreview: jest.fn() }));

const i18n = initI18n('en');
const row = makeRow({ name: 'a.pdf' });

async function setup() {
  jest.mocked(openToolPreview).mockResolvedValue({
    ok: true,
    preview: { fileUri: 'file:///cache/p.pdf', pageCount: 4, close: jest.fn() },
  });
  const onRun = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <WatermarkOptions row={row} onRun={onRun} />
    </I18nextProvider>,
  );
  await act(async () => {});
  const press = async (label: string) => await fireEvent.press(screen.getByLabelText(label));
  return { onRun, press };
}

describe('WatermarkOptions', () => {
  it('needs the watermark text before it can run', async () => {
    const { onRun, press } = await setup();
    expect(screen.getByLabelText('Text')).toBeChecked();
    expect(screen.getByLabelText('35%')).toBeChecked();
    expect(screen.getByLabelText('45°')).toBeChecked();
    expect(screen.getByLabelText('Medium')).toBeChecked();
    expect(screen.getByLabelText('Centre')).toBeChecked();
    expect(screen.getByLabelText('Grey')).toBeChecked();
    expect(screen.getByText('Enter the watermark text')).toBeTruthy();
    expect(screen.getByLabelText('Add watermark')).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Watermark text'), '   ');
    expect(screen.getByLabelText('Add watermark')).toBeDisabled();
    await press('Add watermark');
    expect(onRun).not.toHaveBeenCalled();
  });

  it('runs with the chosen text, look, position and pages', async () => {
    const { onRun, press } = await setup();
    await fireEvent.changeText(screen.getByLabelText('Watermark text'), 'DRAFT');
    await press('50%');
    await press('-45°');
    await press('Large');
    await press('Top right');
    await press('Some pages');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5'), '1-2');
    expect(screen.queryByText('Enter the watermark text')).toBeNull();
    await press('Add watermark');
    expect(onRun).toHaveBeenCalledWith({
      source: { kind: 'text', text: 'DRAFT', color: 'grey' },
      opacity: 0.5,
      angle: -45,
      size: 'large',
      position: 'top-right',
      pages: [1, 2],
    });
  });

  it('limits the text to 60 characters', async () => {
    await setup();
    expect(screen.getByLabelText('Watermark text')).toHaveProp('maxLength', 60);
  });

  it('cannot run with an invalid page range', async () => {
    const { press } = await setup();
    await fireEvent.changeText(screen.getByLabelText('Watermark text'), 'DRAFT');
    await press('Some pages');
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5'), '7');
    expect(screen.getByLabelText('Add watermark')).toBeDisabled();
  });
});
