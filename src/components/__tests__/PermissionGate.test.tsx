import { render, screen } from '@testing-library/react-native';
import type React from 'react';
import { Text } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { PermissionGate } from '@/components/PermissionGate';
import { initI18n } from '@/i18n';
import { useStorage } from '@/stores/storageStore';

function renderGate(withoutAccess?: React.ReactNode) {
  return render(
    <I18nextProvider i18n={initI18n('en')}>
      <PermissionGate withoutAccess={withoutAccess}>
        <Text>child content</Text>
      </PermissionGate>
    </I18nextProvider>,
  );
}

describe('PermissionGate', () => {
  beforeEach(() => {
    useStorage.setState({ mode: 'none', roots: [], canRequestFullAccess: true });
  });

  it('shows the explainer and hides children when there is no access', async () => {
    await renderGate();
    expect(
      screen.getByText(
        'To find all your PDFs, PDF Toolkit needs access to your files. Nothing is uploaded.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('child content')).toBeNull();
  });

  it('shows withoutAccess below the explainer when there is no access', async () => {
    await renderGate(<Text>recent opened</Text>);
    expect(screen.getByText(/needs access/)).toBeTruthy();
    expect(screen.getByText('recent opened')).toBeTruthy();
    expect(screen.queryByText('child content')).toBeNull();
  });

  it('does not show withoutAccess when access is granted', async () => {
    useStorage.setState({ mode: 'full' });
    await renderGate(<Text>recent opened</Text>);
    expect(screen.queryByText('recent opened')).toBeNull();
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('renders children when folders are granted', async () => {
    useStorage.setState({ mode: 'saf' });
    await renderGate();
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('renders children with full access', async () => {
    useStorage.setState({ mode: 'full' });
    await renderGate();
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('shows a spinner (no children, no explainer) while the mode is unknown', async () => {
    useStorage.setState({ mode: 'unknown' });
    await renderGate();
    expect(screen.queryByText('child content')).toBeNull();
    expect(screen.queryByText(/needs access/)).toBeNull();
  });
});
