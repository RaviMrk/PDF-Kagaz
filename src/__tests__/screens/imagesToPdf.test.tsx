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
const uris = (n: number) => Array.from({ length: n }, (_, i) => `content://picker/${i}`);

let start: jest.Mock<StartResult>;
let alert: jest.SpyInstance;
let handlers: (() => boolean)[];
let pick: jest.SpyInstance;
let cleanup: jest.SpyInstance;

const flush = () =>
  act(async () => {
    jest.runOnlyPendingTimers();
  });
async function open(url = '/tool/images-to-pdf') {
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
  await act(async () => router.push('/tool/images-to-pdf'));
  await act(async () => {});
  await act(async () => {});
  return { pathname: () => pending.getPathname() };
}
const discardNow = async () => {
  const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
};
const press = async (label: string | RegExp) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};

describe('images to PDF screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fakeSortables.reset();
    useSettings.setState({ onboardingDone: true, imageQuality: 'standard' });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [], status: 'idle', requestThumb: jest.fn() });
    start = jest.fn((): StartResult => ({ ok: true, jobId: 'j1' }));
    useToolJobs.setState({ active: null, last: null, start, cancel: jest.fn() });
    jest.spyOn(pdfNative, 'createToolWorkspace').mockResolvedValue('file:///ws');
    pick = jest.spyOn(pdfNative, 'pickImages').mockResolvedValue({ uris: uris(3), dropped: 0 });
    jest
      .spyOn(pdfNative, 'importImage')
      .mockImplementation((_u, _s, index) =>
        Promise.resolve({ index, width: 400, height: 300, sizeBytes: 10 }),
      );
    jest.spyOn(pdfNative, 'renderImageThumbnail').mockResolvedValue('file:///t.jpg');
    cleanup = jest.spyOn(pdfNative, 'cleanToolWorkspace').mockResolvedValue(undefined);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    handlers = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
      handlers.push(h as () => boolean);
      return { remove: jest.fn() };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens the picker on mount and lists the picks', async () => {
    await open();
    expect(pick).toHaveBeenCalledWith(100);
    expect(screen.getByText('3 images')).toBeTruthy();
  });

  it('removes a selected image', async () => {
    await open();
    await press(/^Image 2 of 3/);
    await press('Remove image 2');
    expect(screen.getByText('2 images')).toBeTruthy();
  });

  it('starts the job with the chosen layout, name and remaining sources', async () => {
    await open();
    await press(/^Image 2 of 3/);
    await press('Remove image 2');
    await press('Letter');
    await fireEvent.changeText(screen.getByLabelText('File name'), 'Trip');
    await act(async () => {});
    await press('Make PDF');
    expect(start).toHaveBeenCalledWith(
      {
        toolId: 'images-to-pdf',
        inputIds: [],
        sessionId: expect.stringMatching(/^img-/),
        images: [0, 2],
        filter: 'colour',
        layout: { pageSize: 'letter', orientation: 'auto', margin: 'small' },
        name: 'Trip',
        quality: 'standard',
      },
      expect.any(Function),
    );
  });

  it('starts the job with the image quality chosen in Settings', async () => {
    useSettings.setState({ imageQuality: 'high' });
    await open();
    await press('Make PDF');
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ quality: 'high' }),
      expect.any(Function),
    );
  });

  it('shows progress for its job and then the result', async () => {
    const r = await open();
    await press('Make PDF');
    await act(async () => {
      useToolJobs.setState({
        active: {
          jobId: 'j1',
          toolId: 'images-to-pdf',
          inputIds: [],
          phase: 'processing',
          fraction: 0.5,
        } as never,
      });
    });
    expect(screen.getByText('Making PDF from images')).toBeTruthy();
    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'j1',
          toolId: 'images-to-pdf',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/result');
  });

  it('shows the empty state when nothing was picked', async () => {
    pick.mockResolvedValue({ uris: [], dropped: 0 });
    await open();
    expect(screen.getByText('Add the photos you want in the PDF')).toBeTruthy();
  });

  it('counts images that could not be added', async () => {
    pick.mockResolvedValue({ uris: uris(2), dropped: 0 });
    jest
      .spyOn(pdfNative, 'importImage')
      .mockRejectedValueOnce(nativeError('ERR_IMAGE_INVALID'))
      .mockImplementation((_u, _s, index) =>
        Promise.resolve({ index, width: 4, height: 3, sizeBytes: 1 }),
      );
    await open();
    expect(screen.getByText("1 image couldn't be added")).toBeTruthy();
    expect(screen.getByText('1 image')).toBeTruthy();
  });

  it('says when the picks went over the limit', async () => {
    // The fallback picker has no item limit: native keeps 100 and reports 1 dropped.
    pick.mockResolvedValue({ uris: uris(100), dropped: 1 });
    await open();
    expect(
      screen.getByText('A PDF can have up to 100 images. Only the first ones were added.'),
    ).toBeTruthy();
    expect(screen.getByText('100 images')).toBeTruthy();
  });

  it('prompts on hardware back, and Discard deletes the session and leaves', async () => {
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    await open();
    expect(handlers.at(-1)!()).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toBe('Discard these images?');
    const buttons = alert.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/tools');
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });

  it('sizes the next pick by the count and numbers it from the next free index', async () => {
    await open();
    await press(/^Image 2 of 3/);
    await press('Remove image 2');
    pick.mockResolvedValue({ uris: ['content://picker/new'], dropped: 0 });
    await press('Add images');
    expect(pick).toHaveBeenLastCalledWith(98);
    expect(pdfNative.importImage).toHaveBeenLastCalledWith(
      'content://picker/new',
      expect.stringMatching(/^img-/),
      3,
      expect.any(Number),
    );
    expect(screen.getByText('3 images')).toBeTruthy();
  });

  it('can add again after failed imports freed capacity', async () => {
    pick.mockResolvedValue({ uris: uris(100), dropped: 0 });
    const imp = jest.spyOn(pdfNative, 'importImage');
    for (let i = 0; i < 5; i += 1) imp.mockRejectedValueOnce(nativeError('ERR_IMAGE_INVALID'));
    imp.mockImplementation((_u, _s, index) =>
      Promise.resolve({ index, width: 4, height: 3, sizeBytes: 1 }),
    );
    await open();
    expect(screen.getByText('95 images')).toBeTruthy();
    pick.mockResolvedValue({ uris: uris(5), dropped: 0 });
    await press('Add images');
    expect(pick).toHaveBeenLastCalledWith(5);
    expect(screen.getByText('100 images')).toBeTruthy();
  });

  it('prompts once for header Back, then leaves on Discard', async () => {
    const r = await openPushed();
    await press('Back');
    expect(alert).toHaveBeenCalledTimes(1);
    await discardNow();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/tools');
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });

  it('prompts once for a gesture back (beforeRemove), then leaves on Discard', async () => {
    const r = await openPushed();
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledTimes(1);
    await discardNow();
    await flush();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(r.pathname()).toBe('/tools');
  });

  it('retries opening the session when the add button is used after a failed open', async () => {
    const create = jest
      .spyOn(pdfNative, 'createToolWorkspace')
      .mockRejectedValueOnce(nativeError('ERR_IO'))
      .mockResolvedValue('file:///ws');
    await open();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(pick).not.toHaveBeenCalled();
    await press('Add images');
    expect(create).toHaveBeenCalledTimes(2);
    expect(pick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3 images')).toBeTruthy();
  });

  it('does not open the picker when left while the session is opening', async () => {
    let finish!: (v: string) => void;
    jest
      .spyOn(pdfNative, 'createToolWorkspace')
      .mockReturnValue(new Promise<string>((res) => (finish = res)));
    const r = await open();
    await act(async () => r.unmount());
    cleanup.mockClear();
    await act(async () => finish('file:///ws'));
    expect(pick).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(expect.stringMatching(/^img-/));
  });

  it('keeps the session when unmounted after Run', async () => {
    const r = await open();
    await press('Make PDF');
    expect(start).toHaveBeenCalledTimes(1);
    cleanup.mockClear();
    await act(async () => r.unmount());
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('redirects /tool/scan to /scan', async () => {
    jest.spyOn(pdfNative, 'scanDocument').mockReturnValue(new Promise(() => {}));
    const r = await open('/tool/scan');
    expect(r.pathname()).toBe('/scan');
  });
});
