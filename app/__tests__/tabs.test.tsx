import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import { useSettings } from '@/stores/settingsStore';

jest.mock('@/db/client', () => ({ db: {} }));
jest.mock('@/db/migrations/migrations', () => ({}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  useMigrations: () => ({ success: true, error: undefined }),
}));

// Resolve the real app/ directory.
const renderApp = (path = '/') => renderRouter('./app', { initialUrl: path });

describe('app shell', () => {
  beforeEach(() => {
    useSettings.setState({ theme: 'system' });
  });

  it('lands on Home and shows the four tabs', async () => {
    await renderApp();
    // renderRouter's getPathname helper is attached to the render promise under RNTL v14,
    // so assert the redirect landed on Home via its content instead.
    expect(screen.getByRole('header', { name: 'Home' })).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.queryByText('Theme')).toBeNull();
    for (const label of ['Home', 'Files', 'Tools', 'Settings']) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    }
  });

  it('switches theme from Settings', async () => {
    await renderApp();
    await fireEvent.press(screen.getAllByLabelText('Settings')[0]!);
    expect(screen.getByLabelText('System')).toBeTruthy();
    expect(screen.getByLabelText('Light')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Dark'));
    expect(useSettings.getState().theme).toBe('dark');
  });
});
