import { act, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert, BackHandler } from 'react-native';
import path from 'path';

import { pdfNative } from '@/services/native/pdfNative';
import { nativeError } from '@/test-utils/fakePdfNative';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs, type StartResult } from '@/stores/toolJobStore';
import { fakeSortables } from '@/test-utils/fakeSortables';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const pages = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    index: from + i,
    width: 400,
    height: 300,
    sizeBytes: 10,
  }));

let start: jest.Mock<StartResult>;
let alert: jest.SpyInstance;
let handlers: (() => boolean)[];
let scan: jest.SpyInstance;
let cleanup: jest.SpyInstance;
let thumb: jest.SpyInstance;

const flush = () =>
  act(async () => {
    jest.runOnlyPendingTimers();
  });
async function open(url = '/scan') {
  const pending = renderRouter(APP_DIR, { initialUrl: url });
  const view = await pending;
  await act(async () => {});
  await act(async () => {});
  return { pathname: () => pending.getPathname(), unmount: view.unmount };
}
async function openPushed() {
  const pending = renderRouter(APP_DIR, { initialUrl: '/tools' });
  await pending;
  await act(async () => {});
  await act(async () => router.push('/scan'));
  await act(async () => {});
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}
const press = async (label: string | RegExp) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};
const discardNow = async () => {
  const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
};

describe('scan screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [], status: 'idle', requestThumb: jest.fn() });
    start = jest.fn((): StartResult => ({ ok: true, jobId: 'j1' }));
    useToolJobs.setState({ active: null, last: null, start, cancel: jest.fn() });
    jest.spyOn(pdfNative, 'createToolWorkspace').mockResolvedValue('file:///ws');
    scan = jest.spyOn(pdfNative, 'scanDocument').mockResolvedValue(pages(0, 2));
    thumb = jest.spyOn(pdfNative, 'renderImageThumbnail').mockResolvedValue('file:///t.jpg');
    cleanup = jest.spyOn(pdfNative, 'cleanToolWorkspace').mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    handlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: jest.fn() };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('launches the scanner on mount and lists the pages', async () => {
    await open();
    expect(scan).toHaveBeenCalledWith(expect.stringMatching(/^img-/), 0, 100);
    expect(screen.getByText('2 pages')).toBeTruthy();
    expect(screen.getByLabelText(/^Page 1 of 2/)).toBeTruthy();
  });

  it('re-requests thumbnails for a filter and saves with it', async () => {
    await open();
    await press('Black & white');
    expect(thumb).toHaveBeenCalledWith(expect.any(String), 0, expect.any(Number), 'bw');
    await press('Save PDF');
    expect(start).toHaveBeenCalledWith(
      {
        toolId: 'scan',
        inputIds: [],
        sessionId: expect.stringMatching(/^img-/),
        images: [0, 1],
        filter: 'bw',
        layout: { pageSize: 'fit', orientation: 'auto', margin: 'none' },
        name: null,
      },
      expect.any(Function),
    );
  });

  it('scans more pages, and a cancelled scan keeps the pages', async () => {
    await open();
    scan.mockResolvedValue(pages(2, 1));
    await press('Scan more pages');
    expect(scan).toHaveBeenLastCalledWith(expect.stringMatching(/^img-/), 2, 98);
    expect(screen.getByText('3 pages')).toBeTruthy();
    scan.mockResolvedValue([]);
    await press('Scan more pages');
    expect(screen.getByText('3 pages')).toBeTruthy();
  });

  it('shows the unavailable copy and offers Images to PDF', async () => {
    scan.mockRejectedValue(nativeError('ERR_SCANNER_UNAVAILABLE'));
    const r = await open();
    expect(screen.getByText(/needs Google Play services/)).toBeTruthy();
    await press('Use Images to PDF instead');
    expect(r.pathname()).toBe('/tool/images-to-pdf');
  });

  it('Close leaves from the unavailable state', async () => {
    scan.mockRejectedValue(nativeError('ERR_SCANNER_UNAVAILABLE'));
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    await open();
    await press('Close');
    expect(replace).toHaveBeenCalledWith('/home');
  });

  it('leaves and discards the session when the first scan is cancelled', async () => {
    scan.mockResolvedValue([]);
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    await open();
    expect(replace).toHaveBeenCalledWith('/home');
    expect(alert).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });

  it('offers Try again after a failed launch', async () => {
    scan.mockRejectedValueOnce(nativeError('ERR_NO_ACTIVITY'));
    await open();
    expect(screen.getByText("Couldn't open the scanner")).toBeTruthy();
    await press('Try again');
    expect(scan).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2 pages')).toBeTruthy();
  });

  it('keeps the pages and shows the copy inline when Scan more is unavailable', async () => {
    await open();
    scan.mockRejectedValue(nativeError('ERR_SCANNER_UNAVAILABLE'));
    await press('Scan more pages');
    expect(screen.getByText(/needs Google Play services/)).toBeTruthy();
    expect(screen.getByText('2 pages')).toBeTruthy();
  });

  it('shows No pages left after removing every page, and Scan relaunches', async () => {
    await open();
    await press(/^Page 1 of 2/);
    await press('Remove page 1');
    await press(/^Page 1 of 1/);
    await press('Remove page 1');
    expect(screen.getByText('No pages left')).toBeTruthy();
    scan.mockResolvedValue(pages(2, 1));
    await press('Scan');
    expect(scan).toHaveBeenLastCalledWith(expect.stringMatching(/^img-/), 2, 100);
    expect(screen.getByText('1 page')).toBeTruthy();
  });

  it('prompts on hardware back and Discard deletes the session', async () => {
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    await open();
    expect(handlers.at(-1)!()).toBe(true);
    expect(alert.mock.calls[0]![0]).toBe('Discard this scan?');
    await discardNow();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/home');
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });

  it('prompts once for header Back, then leaves', async () => {
    const r = await openPushed();
    await press('Back');
    expect(alert).toHaveBeenCalledTimes(1);
    await discardNow();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/tools');
  });

  it('prompts once for a gesture back (beforeRemove)', async () => {
    const r = await openPushed();
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledTimes(1);
    await discardNow();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/tools');
  });

  it('shows progress for its job and then the result', async () => {
    const r = await open();
    await press('Save PDF');
    await act(async () => {
      useToolJobs.setState({
        active: {
          jobId: 'j1',
          toolId: 'scan',
          inputIds: [],
          phase: 'processing',
          fraction: 0.5,
        } as never,
      });
    });
    expect(screen.getByText('Saving scan')).toBeTruthy();
    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'j1',
          toolId: 'scan',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/result');
  });

  it('keeps the session when unmounted after Save', async () => {
    const r = await open();
    await press('Save PDF');
    cleanup.mockClear();
    await act(async () => r.unmount());
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not launch the scanner when left while the session is opening', async () => {
    let finish!: (v: string) => void;
    jest
      .spyOn(pdfNative, 'createToolWorkspace')
      .mockReturnValue(new Promise<string>((res) => (finish = res)));
    const r = await open();
    await act(async () => r.unmount());
    cleanup.mockClear();
    await act(async () => finish('file:///ws'));
    expect(scan).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });
});
