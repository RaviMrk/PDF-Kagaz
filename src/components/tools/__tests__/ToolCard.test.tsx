import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';

import { ToolCard } from '@/components/tools/ToolCard';
import { initI18n } from '@/i18n';
import { toolById } from '@/services/tools/toolRegistry';

const i18n = initI18n('en');
const render = (ui: ReactElement) => rtlRender(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('ToolCard', () => {
  it('calls onPress with the tool when it is available', async () => {
    const onPress = jest.fn();
    const tool = toolById('merge')!;
    await render(<ToolCard tool={tool} onPress={onPress} />);
    expect(screen.getByText('Combine PDFs into one')).toBeOnTheScreen();
    expect(screen.queryByText('Coming soon')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Merge' }));
    expect(onPress).toHaveBeenCalledWith(tool);
  });

  it('shows a Coming soon badge, is disabled and ignores presses when unavailable', async () => {
    const onPress = jest.fn();
    await render(<ToolCard tool={toolById('protect')!} onPress={onPress} />);
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
    const card = screen.getByLabelText('Protect with password, coming soon');
    expect(card.props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(card);
    expect(onPress).not.toHaveBeenCalled();
  });
});
