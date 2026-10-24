import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { initI18n } from '@/i18n';
import type { StampPosition } from '@/services/tools/runTool';

import { PositionGrid } from '../PositionGrid';

const i18n = initI18n('en');

async function setup(value: StampPosition, allowed?: StampPosition[]) {
  const onChange = jest.fn();
  await render(
    <I18nextProvider i18n={i18n}>
      <PositionGrid label="Position" value={value} onChange={onChange} allowed={allowed} />
    </I18nextProvider>,
  );
  return { onChange };
}

describe('PositionGrid', () => {
  it('shows nine radios with the chosen one checked', async () => {
    await setup('center');
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(9);
    expect(screen.getByLabelText('Centre')).toBeChecked();
    expect(screen.getByLabelText('Top left')).not.toBeChecked();
    for (const r of radios) expect(r).toHaveStyle({ minHeight: 48, minWidth: 48 });
  });

  it('renders only the allowed cells', async () => {
    await setup('bottom-center', [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ]);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.queryByLabelText('Centre')).toBeNull();
    expect(screen.queryByLabelText('Middle left')).toBeNull();
    expect(screen.getByLabelText('Bottom centre')).toBeChecked();
  });

  it('reports the pressed cell', async () => {
    const { onChange } = await setup('center');
    await fireEvent.press(screen.getByLabelText('Bottom right'));
    expect(onChange).toHaveBeenCalledWith('bottom-right');
  });
});
