import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import type { ToolOutcome } from '@/services/tools/runTool';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs, type JobView } from '@/stores/toolJobStore';
import { makeRow } from '@/test-utils/fileRows';
import { formatBytes } from '@/utils/fileSize';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');

const output = makeRow({ name: 'scan compressed.pdf', pageCount: 4 });
const WARNING = (before: number, after: number) =>
  `This PDF couldn't be made smaller (${formatBytes(before)} → ${formatBytes(after)}). Keep the original instead?`;
const DELETED = 'New file deleted. Your original is unchanged.';

let outcomeOf: jest.Mock<JobView, [string]>;
let remove: jest.Mock;

const done = (sizes: { before: number; after: number }): JobView => {
  const outcome: ToolOutcome = { ok: true, outputs: [output], extras: { sizes } };
  return { kind: 'done', toolId: 'compress', outcome };
};

async function open() {
  await renderRouter(APP_DIR, { initialUrl: '/result?jobId=j1' });
  await act(async () => {});
}

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};

describe('result screen after compress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    remove = jest.fn(async () => null);
    useFiles.setState({ files: [output], status: 'idle', requestThumb: jest.fn(), remove });
    outcomeOf = jest.fn();
    useToolJobs.setState({
      active: null,
      last: null,
      outcomeOf,
      markSeen: jest.fn(),
      dismiss: jest.fn(),
      inputNameOf: jest.fn(() => null),
    });
  });

  it('shows how much smaller the file got', async () => {
    outcomeOf.mockReturnValue(done({ before: 1_000_000, after: 400_000 }));
    await open();
    expect(
      screen.getByText(`${formatBytes(1_000_000)} → ${formatBytes(400_000)} (60% smaller)`),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Delete new file')).toBeNull();
    expect(screen.getByText('scan compressed.pdf')).toBeTruthy();
  });

  it('warns when the file did not get smaller; Delete new file removes the output', async () => {
    outcomeOf.mockReturnValue(done({ before: 1000, after: 1200 }));
    await open();
    expect(screen.getByText(WARNING(1000, 1200))).toBeTruthy();
    await press('Delete new file');
    expect(remove).toHaveBeenCalledWith(output.id);
    expect(screen.getByText(DELETED)).toBeTruthy();
    expect(screen.queryByText('scan compressed.pdf')).toBeNull();
    expect(screen.queryByLabelText('Delete new file')).toBeNull();
  });

  it('Keep both dismisses the warning and keeps the output', async () => {
    outcomeOf.mockReturnValue(done({ before: 1000, after: 1000 }));
    await open();
    expect(screen.getByText(WARNING(1000, 1000))).toBeTruthy();
    await press('Keep both');
    expect(screen.queryByText(WARNING(1000, 1000))).toBeNull();
    expect(screen.queryByLabelText('Delete new file')).toBeNull();
    expect(screen.getByText('scan compressed.pdf')).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps the warning and says why when the new file cannot be deleted', async () => {
    remove.mockResolvedValue('permission');
    outcomeOf.mockReturnValue(done({ before: 1000, after: 1200 }));
    await open();
    await press('Delete new file');
    expect(screen.queryByText(DELETED)).toBeNull();
    expect(screen.getByText("PDF Toolkit can't change this file")).toBeTruthy();
    expect(screen.getByText('scan compressed.pdf')).toBeTruthy();
    expect(screen.getByLabelText('Delete new file')).toBeTruthy();
  });
});
