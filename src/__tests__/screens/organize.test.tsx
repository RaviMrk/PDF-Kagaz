import { act, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert, BackHandler } from 'react-native';
import path from 'path';

import { pdfNative } from '@/services/native/pdfNative';
import { openToolPreview } from '@/services/tools/toolPreview';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs, type StartResult } from '@/stores/toolJobStore';
import { fakeSortables } from '@/test-utils/fakeSortables';
import { makeRow } from '@/test-utils/fileRows';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));
jest.mock('@/services/tools/toolPreview', () => ({ openToolPreview: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const preview = jest.mocked(openToolPreview);
const a = makeRow({ name: 'a.pdf' });
const FILE_URI = 'file:///data/cache/tools/preview-x/in-0.pdf';

let start: jest.Mock<StartResult>;
let close: jest.Mock;

const mockPreview = (pageCount: number) =>
  preview.mockResolvedValue({ ok: true, preview: { fileUri: FILE_URI, pageCount, close } });

// Navigation commits on a timer.
const flush = () =>
  act(async () => {
    jest.runOnlyPendingTimers();
  });
async function open(url = '/tool/organize/id-a.pdf') {
  const pending = renderRouter(APP_DIR, { initialUrl: url });
  await pending;
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}
const select = (page: number) => press(new RegExp(`^Page ${page}, position`));
const press = async (label: string | RegExp) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};

describe('organise screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [a], status: 'idle', requestThumb: jest.fn() });
    start = jest.fn((): StartResult => ({ ok: true, jobId: 'j1' }));
    useToolJobs.setState({ active: null, last: null, start, cancel: jest.fn() });
    close = jest.fn();
    mockPreview(3);
    jest.spyOn(pdfNative, 'renderToolThumbnail').mockResolvedValue('file:///t.jpg');
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows a tile per page and a disabled Save', async () => {
    await open();
    expect(screen.getByText('Page 1')).toBeTruthy();
    expect(screen.getByText('Page 2')).toBeTruthy();
    expect(screen.getByText('Page 3')).toBeTruthy();
    expect(screen.getByLabelText('Save as new PDF')).toBeDisabled();
    expect(pdfNative.renderToolThumbnail).toHaveBeenCalledWith(
      FILE_URI,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('saves the edited pages and follows the job to the result', async () => {
    const r = await open();
    await select(2);
    await press('Rotate page 2');
    await select(3);
    await press('Delete page 3');
    await select(1);
    await press('Duplicate page 1');
    await press('Save as new PDF');
    expect(start).toHaveBeenCalledWith(
      {
        toolId: 'organize',
        inputIds: ['id-a.pdf'],
        pages: [
          { source: 1, rotate: 0 },
          { source: 1, rotate: 0 },
          { source: 2, rotate: 90 },
        ],
      },
      expect.any(Function),
    );
    await act(async () => {
      useToolJobs.setState({
        active: { jobId: 'j1', toolId: 'organize', phase: 'processing', fraction: 0.5 },
      });
    });
    expect(screen.getByText('Saving pages')).toBeTruthy();
    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'j1',
          toolId: 'organize',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/result');
  });

  it('applies a dragged order', async () => {
    await open();
    const p = (key: string, source: number) => ({ key, source, rotate: 0 });
    await act(async () => {
      fakeSortables.lastProps().onDragEnd({ data: [p('p3', 3), p('p1', 1), p('p2', 2)] });
    });
    await press('Save as new PDF');
    expect(start.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ pages: [3, 1, 2].map((source) => ({ source, rotate: 0 })) }),
    );
  });

  it('keeps the last page: delete is disabled with a hint', async () => {
    await open();
    await select(1);
    await press('Delete page 1');
    await select(2);
    await press('Delete page 2');
    expect(screen.getByText('A PDF needs at least one page')).toBeTruthy();
    await select(3);
    expect(screen.getByLabelText('Delete page 3')).toBeDisabled();
  });

  it('acts only on a selected page and disables moves at the ends', async () => {
    await open();
    expect(screen.getByText('Tap a page to rotate, duplicate, delete or move it')).toBeTruthy();
    expect(screen.getByLabelText(/^Rotate page/)).toBeDisabled();
    await select(1);
    expect(screen.getByLabelText('Move page 1 earlier')).toBeDisabled();
    expect(screen.getByLabelText('Move page 1 later')).not.toBeDisabled();
    await press('Move page 1 later');
    // Selection follows the moved page; it now reads Page 1, position 2.
    expect(screen.getByLabelText('Move page 1 earlier')).not.toBeDisabled();
    await press(/^Page 1, position 2/);
    expect(screen.getByLabelText(/^Rotate page/)).toBeDisabled();
  });

  it('names a moved page by its source number', async () => {
    await open();
    const p = (key: string, source: number) => ({ key, source, rotate: 0 });
    await act(async () => {
      fakeSortables.lastProps().onDragEnd({ data: [p('p3', 3), p('p1', 1), p('p2', 2)] });
    });
    expect(screen.getByLabelText('Page 3, position 1')).toBeTruthy();
  });

  it('contains a rotated thumbnail in a square box', async () => {
    await open();
    await select(1);
    await press('Rotate page 1');
    const box = screen.getAllByTestId('page-thumb')[0]!;
    expect(box).toHaveStyle({ aspectRatio: 1, overflow: 'hidden' });
    expect(screen.getAllByTestId('page-image')[0]).toHaveStyle({
      transform: [{ rotate: '90deg' }],
    });
  });

  it('explains an encrypted file without offering Save', async () => {
    preview.mockResolvedValue({ ok: false, failure: 'encrypted', lock: 'password' });
    await open();
    // The password prompt comes first; without a password nothing can be organised.
    await press('Cancel');
    expect(screen.getByText(/password/i)).toBeTruthy();
    expect(screen.queryByLabelText('Save as new PDF')).toBeNull();
  });

  it('asks for the password of a locked file, then edits and saves it with that password', async () => {
    preview.mockImplementation((_row, opts) =>
      Promise.resolve(
        opts?.password === 'secret'
          ? { ok: true as const, preview: { fileUri: FILE_URI, pageCount: 3, close } }
          : { ok: false as const, failure: 'encrypted' as const, lock: 'password' as const },
      ),
    );
    await open();
    expect(
      screen.getByText('"a.pdf" is protected. Enter its password to use it in this tool.'),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await press('Use');
    expect(preview).toHaveBeenLastCalledWith(a, { password: 'secret' });
    expect(screen.getByText('Page 3')).toBeTruthy();
    await select(3);
    await press('Delete page 3');
    await press('Save as new PDF');
    expect(start).toHaveBeenCalledWith(
      {
        toolId: 'organize',
        inputIds: ['id-a.pdf'],
        pages: [
          { source: 1, rotate: 0 },
          { source: 2, rotate: 0 },
        ],
        passwords: { 0: 'secret' },
      },
      expect.any(Function),
    );
  });

  it('rejects documents over 300 pages', async () => {
    mockPreview(301);
    await open();
    expect(screen.getByText(/up to 300 pages/)).toBeTruthy();
    expect(screen.queryByLabelText('Save as new PDF')).toBeNull();
  });

  it('closes the preview on unmount', async () => {
    await open();
    await act(async () => {
      screen.unmount();
    });
    expect(close).toHaveBeenCalled();
  });
});

describe('leaving with edits', () => {
  let alert: jest.SpyInstance;
  let handlers: (() => boolean)[];
  const discard = async () => {
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
  };
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [a], status: 'idle', requestThumb: jest.fn() });
    start = jest.fn((): StartResult => ({ ok: true, jobId: 'j1' }));
    useToolJobs.setState({ active: null, last: null, start, cancel: jest.fn() });
    close = jest.fn();
    mockPreview(3);
    jest.spyOn(pdfNative, 'renderToolThumbnail').mockResolvedValue('file:///t.jpg');
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    handlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: jest.fn() };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('prompts once for hardware back, then leaves on Discard', async () => {
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    await open();
    await select(1);
    await press('Rotate page 1');
    expect(handlers.at(-1)!()).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    await discard();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/tools');
  });

  it('does not prompt when a saved job finishes', async () => {
    const r = await open();
    await select(1);
    await press('Rotate page 1');
    await press('Save as new PDF');
    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'j1',
          toolId: 'organize',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/result');
    expect(alert).not.toHaveBeenCalled();
  });
  it('prompts once for header Back, then leaves on Discard', async () => {
    const r = await open();
    await select(1);
    await press('Rotate page 1');
    await press('Back');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toBe('Discard changes?');
    await discard();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/tools');
  });
});
