import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import { DbGate } from '@/components/DbGate';
import { resetDbForTests } from '@/db/client';
import { initI18n } from '@/i18n';

const mockOpen = jest.fn((..._args: unknown[]): unknown => {
  throw new Error('open failed');
});

jest.mock('expo-sqlite', () => ({ openDatabaseSync: (...a: unknown[]) => mockOpen(...a) }));
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: async () => {} }));
jest.mock('@/db/migrations/migrations', () => ({}));

beforeEach(() => {
  jest.clearAllMocks();
  resetDbForTests();
});

it('shows the error screen (no crash) when opening the database throws, and Retry re-attempts', async () => {
  await render(
    <I18nextProvider i18n={initI18n('en')}>
      <DbGate>
        <Text>child content</Text>
      </DbGate>
    </I18nextProvider>,
  );
  expect(await screen.findByText('open failed')).toBeTruthy();
  expect(screen.getByText("Couldn't open the app's database.")).toBeTruthy();
  expect(mockOpen).toHaveBeenCalledTimes(1);

  mockOpen.mockImplementation(() => ({ execSync: () => {}, getAllSync: () => [] }));
  await fireEvent.press(screen.getByLabelText('Retry'));
  expect(await screen.findByText('child content')).toBeTruthy();
  expect(mockOpen).toHaveBeenCalledTimes(2);
});
