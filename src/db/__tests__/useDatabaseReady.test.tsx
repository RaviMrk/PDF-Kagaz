import { renderHook, waitFor } from '@testing-library/react-native';
import { resetDbForTests } from '@/db/client';
import { useDatabaseReady } from '@/db/useDatabaseReady';

const calls: string[] = [];
const execSync = jest.fn((sql: string) => {
  calls.push(`exec:${sql}`);
});
const getAllSync = jest.fn((sql: string) => {
  calls.push(`all:${sql}`);
  return [];
});
const mockOpen = jest.fn((..._args: unknown[]) => {
  calls.push('open');
  return { execSync, getAllSync };
});
const mockMigrate = jest.fn(async () => {
  calls.push('mockMigrate');
});

jest.mock('expo-sqlite', () => ({ openDatabaseSync: (...a: unknown[]) => mockOpen(...a) }));
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: () => mockMigrate() }));
jest.mock('@/db/migrations/migrations', () => ({}));

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
  resetDbForTests();
});

describe('useDatabaseReady', () => {
  it('opens with WAL, migrates, and only then enables foreign keys', async () => {
    const { result } = await renderHook(() => useDatabaseReady());
    await waitFor(() => expect(result.current.success).toBe(true));
    expect(calls).toEqual([
      'open',
      'exec:PRAGMA journal_mode = WAL',
      'mockMigrate',
      'exec:PRAGMA foreign_keys = ON',
      'all:PRAGMA foreign_key_check',
    ]);
  });

  it('reports an error instead of throwing when opening the database fails', async () => {
    mockOpen.mockImplementationOnce(() => {
      throw new Error('cannot open');
    });
    const { result } = await renderHook(() => useDatabaseReady());
    await waitFor(() => expect(result.current.error?.message).toBe('cannot open'));
    expect(result.current.success).toBe(false);
  });

  it('reports an error when migration fails', async () => {
    mockMigrate.mockRejectedValueOnce(new Error('bad migration'));
    const { result } = await renderHook(() => useDatabaseReady());
    await waitFor(() => expect(result.current.error?.message).toBe('bad migration'));
    expect(calls).not.toContain('exec:PRAGMA foreign_keys = ON');
  });
});
