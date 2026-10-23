import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

// A short list: the screen is virtualised, so the full list renders only a window.
jest.mock('@/config/licenses.json', () => [
  { name: 'react', version: '19.2.3', license: 'MIT', text: 'aaa' },
  { name: 'react-native', version: '0.86.3', license: 'MIT', text: 'bbb' },
]);
jest.mock('@/config/licenseTexts.json', () => ({
  aaa: 'React licence text',
  bbb: 'Permission is hereby granted for React Native',
}));

const APP_DIR = path.join(__dirname, '../../../app');

describe('Licences screen', () => {
  it('lists the Android and JavaScript libraries', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/licenses' });
    expect(screen.getByText('Open-source licences')).toBeTruthy();
    expect(screen.getByText('Android libraries')).toBeTruthy();
    expect(screen.getByText('JavaScript libraries')).toBeTruthy();
    expect(screen.getByText('OkHttp, Okio and zstd-kmp · Apache-2.0')).toBeTruthy();
    expect(screen.getByText('react-native 0.86.3 · MIT')).toBeTruthy();
  });

  it('opens the full licence text of a library and returns to the list', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/licenses' });
    const row = screen.getByLabelText('Show licence text for react-native 0.86.3');
    expect(row.props.accessibilityRole).toBe('button');
    await fireEvent.press(row);
    expect(screen.getByText('Permission is hereby granted for React Native')).toBeTruthy();
    expect(screen.queryByText('JavaScript libraries')).toBeNull();
    await fireEvent.press(screen.getByLabelText('All licences'));
    expect(screen.getByText('JavaScript libraries')).toBeTruthy();
    expect(screen.queryByText('Permission is hereby granted for React Native')).toBeNull();
  });

  it('has a Back button of at least 48 dp that leaves the screen', async () => {
    const pending = renderRouter(APP_DIR, { initialUrl: '/licenses' });
    await pending;
    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    const style = Object.assign({}, ...[back.props.style].flat(Infinity));
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    await fireEvent.press(back);
    expect(pending.getPathname()).toBe('/settings');
  });
});
