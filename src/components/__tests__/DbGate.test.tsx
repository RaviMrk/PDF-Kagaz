import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { DbGate } from '@/components/DbGate';
import { initI18n } from '@/i18n';

jest.mock('@/db/useDatabaseReady', () => ({ useDatabaseReady: () => ({ success: false }) }));

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

  it('remounts the gate on Retry so the migration hook runs again', async () => {
    // Per-mount state: fails on the first mount, succeeds on any later mount.
    let mounts = 0;
    const useFlakyMigrations = () => {
      const [mount] = useState(() => ++mounts);
      return mount === 1 ? { success: false, error: new Error('boom') } : { success: true };
    };
    await renderGate(useFlakyMigrations);
    expect(screen.queryByText('child content')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Retry'));
    expect(screen.getByText('child content')).toBeTruthy();
  });
});
