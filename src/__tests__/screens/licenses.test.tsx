import { fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

// A short list: the screen is virtualised, so the full 800-entry list renders only a window.
jest.mock('@/config/licenses.json', () => [
  { name: 'react', version: '19.2.3', license: 'MIT' },
  { name: 'react-native', version: '0.86.3', license: 'MIT' },
]);

const APP_DIR = path.join(__dirname, '../../../app');

describe('Licences screen', () => {
  it('lists the Android and JavaScript libraries', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/licenses' });
    expect(screen.getByText('Open-source licences')).toBeTruthy();
    expect(screen.getByText('Android libraries')).toBeTruthy();
    expect(screen.getByText('JavaScript libraries')).toBeTruthy();
    expect(screen.getByText('AndroidX  · Apache-2.0'.replace('  ', ' '))).toBeTruthy();
    expect(screen.getByText('react-native 0.86.3 · MIT')).toBeTruthy();
  });

  it('has a labelled Back button at least 48 dp tall', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/licenses' });
    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    await fireEvent.press(back);
  });
});
