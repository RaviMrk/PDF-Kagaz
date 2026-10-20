import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { DbGate } from '@/components/DbGate';
import { initI18n } from '@/i18n';

jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/migrations/migrations', () => ({}));

function renderGate(hook: () => { success: boolean; error?: Error }) {
  return render(
    <I18nextProvider i18n={initI18n('en')}>
      <DbGate useMigrationsHook={hook}>
        <Text>child content</Text>
      </DbGate>
    </I18nextProvider>,
  );
}

describe('DbGate', () => {
  it('renders children when migrations succeed', async () => {
    await renderGate(() => ({ success: true }));
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('shows the error and a Retry button when migrations fail', async () => {
    await renderGate(() => ({ success: false, error: new Error('disk full') }));
    expect(screen.getByText("Couldn't open the app's database.")).toBeTruthy();
    expect(screen.getByText('disk full')).toBeTruthy();
    expect(screen.getByLabelText('Retry')).toBeTruthy();
    expect(screen.queryByText('child content')).toBeNull();
  });

  it('re-runs the migration hook when Retry is pressed', async () => {
    const hook = jest.fn(() => ({ success: false, error: new Error('boom') }));
    await renderGate(hook);
    const before = hook.mock.calls.length;
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(hook.mock.calls.length).toBeGreaterThan(before);
  });
});
