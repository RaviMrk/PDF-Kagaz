import { act, fireEvent } from '@testing-library/react-native';
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

async function open(url = '/tool/organize/id-a.pdf') {
  const pending = renderRouter(APP_DIR, { initialUrl: url });
  await pending;
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}
const press = async (label: string) => {
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
    await press('Rotate page 2');
    await press('Delete page 3');
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

  it('refuses to delete the last page', async () => {
    await open();
    await press('Delete page 1');
    expect(screen.queryByText('A PDF needs at least one page')).toBeNull();
    await press('Delete page 1');
    await press('Delete page 1');
    expect(screen.getByText('A PDF needs at least one page')).toBeTruthy();
    expect(screen.getByText('Page 1')).toBeTruthy();
  });

  it('explains an encrypted file without offering Save', async () => {
    preview.mockResolvedValue({ ok: false, failure: 'encrypted' });
    await open();
    expect(screen.getByText(/password/i)).toBeTruthy();
    expect(screen.queryByLabelText('Save as new PDF')).toBeNull();
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

  it('asks before discarding changes on hardware back', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const handlers: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: jest.fn() };
    });
    await open();
    await press('Rotate page 1');
    expect(handlers.at(-1)!()).toBe(true);
    expect(alert).toHaveBeenCalledWith(
      'Discard changes?',
      "Your page changes haven't been saved.",
      expect.any(Array),
    );
  });
});
