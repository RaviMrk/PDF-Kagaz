import { act, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import path from 'path';

import { interstitial } from '@/services/ads/interstitial';
import type { SavedImages, ToolOutcome } from '@/services/tools/runTool';
import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs, type JobView, type StartResult } from '@/stores/toolJobStore';
import { nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';

import PdfNativeModule from '../../../modules/pdf-native';

jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');

const merged = makeRow({ name: 'a merged.pdf', pageCount: 5 });
const second = makeRow({ name: 'b.pdf', pageCount: null });
const inA = makeRow({ name: 'in-a.pdf' });
const inB = makeRow({ name: 'in-b.pdf' });

let inputNameOf: jest.Mock<string | null>;
let outcomeOf: jest.Mock<JobView, [string]>;
let markSeen: jest.Mock;
let retry: jest.Mock<StartResult>;
let cancel: jest.Mock;
let dismiss: jest.Mock;

const NO_PASSWORD_NOTE =
  'The new file has no password. Use Protect with password to lock it again.';
const done = (outcome: ToolOutcome): JobView => ({ kind: 'done', toolId: 'merge', outcome });

async function open(url = '/result?jobId=j1') {
  const pending = renderRouter(APP_DIR, { initialUrl: url });
  await pending;
  await act(async () => {});
  return { params: () => pending.getSearchParams(), pathname: () => pending.getPathname() };
}

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};

describe('result screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({
      files: [merged, second, inA, inB],
      status: 'idle',
      requestThumb: jest.fn(),
    });
    inputNameOf = jest.fn(() => null);
    outcomeOf = jest.fn();
    markSeen = jest.fn();
    retry = jest.fn((): StartResult => ({ ok: true, jobId: 'j2' }));
    cancel = jest.fn();
    dismiss = jest.fn();
    useToolJobs.setState({
      active: null,
      last: null,
      outcomeOf,
      markSeen,
      retry,
      cancel,
      dismiss,
      inputNameOf,
    });
  });

  it('lists every output and marks the job seen', async () => {
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged, second] }));
    await open();
    expect(screen.getByRole('header', { name: 'Done' })).toBeTruthy();
    expect(screen.getByLabelText('Done')).toBeTruthy();
    expect(screen.getByText('Saved to Documents/PDFToolkit')).toBeTruthy();
    expect(screen.getByText('a merged.pdf')).toBeTruthy();
    expect(screen.getByText('b.pdf')).toBeTruthy();
    expect(screen.queryByText(NO_PASSWORD_NOTE)).toBeNull();
    expect(markSeen).toHaveBeenCalledWith('j1');
  });

  it('says when the new file has no password (a locked input was decrypted)', async () => {
    outcomeOf.mockReturnValue(
      done({ ok: true, outputs: [merged], extras: { passwordRemoved: true } }),
    );
    await open();
    expect(screen.getByText(NO_PASSWORD_NOTE)).toBeTruthy();
  });

  it('opens, shares and saves a copy of an output', async () => {
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await open();
    await press('Save a copy of a merged.pdf');
    expect(PdfNativeModule.saveCopyAs).toHaveBeenCalledWith(merged.uri, 'a merged.pdf');
    expect(screen.getByText('Saved a copy')).toBeTruthy();
    await press('Share a merged.pdf');
    expect(PdfNativeModule.sharePdf).toHaveBeenCalledWith(merged.uri, 'Share PDF');
  });

  it('opens an output in the reader', async () => {
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    const r = await open();
    await press('Open a merged.pdf');
    expect(r.pathname()).toBe(`/reader/${merged.id}`);
  });

  it('does not report a cancelled save', async () => {
    jest.mocked(PdfNativeModule.saveCopyAs).mockResolvedValueOnce(false);
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await open();
    await press('Save a copy of a merged.pdf');
    expect(screen.queryByText('Saved a copy')).toBeNull();
  });

  it('drops a missing output and says so', async () => {
    jest
      .mocked(PdfNativeModule.saveCopyAs)
      .mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await open();
    await press('Save a copy of a merged.pdf');
    expect(screen.getByText('This file no longer exists')).toBeTruthy();
    expect(useFiles.getState().getRow(merged.id)).toBeNull();
  });

  it('renders an unindexed fallback output and still shares it', async () => {
    const bare = makeRow({ name: 'bare.pdf', pageCount: null, thumbPath: null });
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [bare] }));
    useFiles.setState({ files: [] });
    await open();
    expect(screen.getByText('bare.pdf')).toBeTruthy();
    expect(screen.getByLabelText('Open bare.pdf')).toBeDisabled();
    expect(
      screen.getByText('You can open this file from Files after the next refresh'),
    ).toBeTruthy();
    await press('Share bare.pdf');
    expect(PdfNativeModule.sharePdf).toHaveBeenCalledWith(bare.uri, 'Share PDF');
  });

  it('reports an existing target on save as', async () => {
    jest.mocked(PdfNativeModule.saveCopyAs).mockRejectedValueOnce(nativeError('ERR_FILE_EXISTS'));
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await open();
    await press('Save a copy of a merged.pdf');
    expect(
      screen.getByText('A file with that name already exists. Choose a different name.'),
    ).toBeTruthy();
  });

  it('marks a job seen when it finishes while the screen is open', async () => {
    outcomeOf.mockReturnValue({
      kind: 'running',
      job: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.5 },
    });
    await open();
    markSeen.mockClear();
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await act(async () => {
      useToolJobs.setState({
        last: {
          jobId: 'j1',
          toolId: 'merge',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(markSeen).toHaveBeenCalledWith('j1');
  });

  it('only cancels its own job', async () => {
    outcomeOf.mockReturnValue({
      kind: 'running',
      job: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.5 },
    });
    useToolJobs.setState({
      active: { jobId: 'other', toolId: 'merge', phase: 'processing', fraction: 0.1 },
    });
    await open();
    await press('Cancel');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('names the failing input and offers retry that follows the new job', async () => {
    outcomeOf.mockImplementation((id) =>
      id === 'j1'
        ? done({ ok: false, failure: 'encrypted', inputIndex: 1, outputs: [] })
        : {
            kind: 'running',
            job: { jobId: id, toolId: 'merge', phase: 'processing', fraction: 0.1 },
          },
    );
    inputNameOf.mockImplementation((_id, i) => (i === 1 ? inB.name : null));
    const r = await open();
    expect(screen.getByText("Couldn't finish")).toBeTruthy();
    expect(screen.getByText(/"in-b.pdf" is password-protected/)).toBeTruthy();
    await press('Try again');
    expect(retry).toHaveBeenCalledWith('j1', expect.any(Function));
    expect(r.params()).toEqual(expect.objectContaining({ jobId: 'j2' }));
    expect(screen.getByLabelText('Cancel')).toBeTruthy();
  });

  it('explains an interrupted job and lists partial outputs', async () => {
    outcomeOf.mockReturnValue(
      done({ ok: false, failure: 'interrupted', inputIndex: null, outputs: [merged] }),
    );
    await open();
    expect(
      screen.getByText('The app was closed before this finished. Some files were already saved.'),
    ).toBeTruthy();
    expect(screen.getByText('These files were saved before the problem:')).toBeTruthy();
    expect(screen.getByText('a merged.pdf')).toBeTruthy();
  });

  it('explains an interrupted job that saved nothing', async () => {
    outcomeOf.mockReturnValue(
      done({ ok: false, failure: 'interrupted', inputIndex: null, outputs: [] }),
    );
    await open();
    expect(screen.getByText('The app was closed before this finished.')).toBeTruthy();
    expect(screen.queryByText('These files were saved before the problem:')).toBeNull();
  });

  it('cancels a running job', async () => {
    outcomeOf.mockReturnValue({
      kind: 'running',
      job: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.5 },
    });
    useToolJobs.setState({
      active: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.5 },
    });
    await open();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.queryByLabelText('Continue in background')).toBeNull();
    await press('Cancel');
    expect(cancel).toHaveBeenCalled();
  });

  it('explains images that are no longer available, also when retry finds them gone', async () => {
    const gone = 'The images for this PDF are no longer available. Add them again.';
    outcomeOf.mockReturnValue({
      kind: 'done',
      toolId: 'images-to-pdf',
      outcome: { ok: false, failure: 'imagesGone', inputIndex: null, outputs: [] },
    });
    retry.mockReturnValueOnce({ ok: false, reason: 'gone' });
    await open();
    expect(screen.getAllByText(gone)).toHaveLength(1);
    await press('Try again');
    expect(retry).toHaveBeenCalledWith('j1', expect.any(Function));
    expect(screen.getAllByText(gone)).toHaveLength(2);
  });

  it('explains a damaged image', async () => {
    outcomeOf.mockReturnValue({
      kind: 'done',
      toolId: 'scan',
      outcome: { ok: false, failure: 'imageInvalid', inputIndex: 1, outputs: [] },
    });
    await open();
    expect(
      screen.getByText("An image is damaged or in a format that isn't supported"),
    ).toBeTruthy();
  });

  it('explains image jobs over the size cap with images copy', async () => {
    outcomeOf.mockReturnValue({
      kind: 'done',
      toolId: 'images-to-pdf',
      outcome: { ok: false, failure: 'totalTooLarge', inputIndex: null, outputs: [] },
    });
    await open();
    expect(
      screen.getByText('These images are too large together for one PDF. Use fewer images.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Merge fewer files/)).toBeNull();
  });

  it('dismisses a failed job when Close leaves, never on retry', async () => {
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    outcomeOf.mockReturnValue({
      kind: 'done',
      toolId: 'scan',
      outcome: { ok: false, failure: 'io', inputIndex: null, outputs: [] },
    });
    retry.mockReturnValueOnce({ ok: false, reason: 'busy' });
    await open();
    await press('Try again');
    expect(dismiss).not.toHaveBeenCalled();
    await press('Close');
    expect(dismiss).toHaveBeenCalledWith('j1');
    expect(replace).toHaveBeenCalledWith('/home');
    replace.mockRestore();
  });

  it('dismisses a finished job when Done leaves', async () => {
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => {});
    outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
    await open();
    await press('Done');
    expect(dismiss).toHaveBeenCalledWith('j1');
    replace.mockRestore();
  });

  it('says when the result is gone', async () => {
    outcomeOf.mockReturnValue({ kind: 'missing' });
    await open();
    expect(screen.getByText('This result is no longer available')).toBeTruthy();
  });

  describe('interstitial', () => {
    let showAfterDone: jest.SpyInstance;
    beforeEach(() => {
      showAfterDone = jest.spyOn(interstitial, 'showAfterDone').mockReturnValue(false);
    });
    afterEach(() => showAfterDone.mockRestore());

    it('is offered once, after leaving, when Done is pressed on a success', async () => {
      outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
      const order: string[] = [];
      jest.spyOn(router, 'canGoBack').mockReturnValue(true);
      const back = jest.spyOn(router, 'back').mockImplementation(() => order.push('back'));
      showAfterDone.mockImplementation(() => {
        order.push('show');
        return false;
      });
      await open();
      await press('Done');
      back.mockRestore();
      jest.mocked(router.canGoBack).mockRestore();
      expect(order).toEqual(['back', 'show']);
      expect(dismiss).toHaveBeenCalledWith('j1');
      expect(showAfterDone).toHaveBeenCalledTimes(1);
    });

    it('is not offered on Open, Share or Save as', async () => {
      outcomeOf.mockReturnValue(done({ ok: true, outputs: [merged] }));
      await open();
      await press('Share a merged.pdf');
      await press('Save a copy of a merged.pdf');
      await press('Open a merged.pdf');
      expect(showAfterDone).not.toHaveBeenCalled();
    });

    it('is not offered when a failed job is closed', async () => {
      outcomeOf.mockReturnValue(
        done({ ok: false, failure: 'interrupted', inputIndex: null, outputs: [] }),
      );
      await open();
      await press('Close');
      expect(dismiss).toHaveBeenCalledWith('j1');
      expect(showAfterDone).not.toHaveBeenCalled();
    });
  });

  describe('pdf to images', () => {
    const URIS = [1, 2, 3].map((n) => `content://media/external/images/media/${n}`);
    const images = (over: Partial<SavedImages> = {}): SavedImages => ({
      count: 3,
      folder: 'Pictures/PDFToolkit/Report pages',
      uris: URIS,
      reducedPages: 0,
      ...over,
    });
    const imagesDone = (outcome: ToolOutcome): JobView => ({
      kind: 'done',
      toolId: 'pdf-to-images',
      outcome,
    });

    it('says where the images were saved and shares or opens them', async () => {
      outcomeOf.mockReturnValue(
        imagesDone({ ok: true, outputs: [], extras: { images: images(), passwordRemoved: true } }),
      );
      await open();
      expect(screen.getByText('Saved 3 images to Pictures/PDFToolkit/Report pages')).toBeTruthy();
      expect(screen.queryByText('Saved to Documents/PDFToolkit')).toBeNull();
      expect(screen.queryByText(NO_PASSWORD_NOTE)).toBeNull();
      expect(screen.queryByText(/lower resolution/)).toBeNull();
      await press('Share');
      expect(PdfNativeModule.shareImages).toHaveBeenCalledWith(URIS, 'Share images');
      await press('Open');
      expect(PdfNativeModule.viewImage).toHaveBeenCalledWith(URIS[0], 'Open');
    });

    it('says one image in the singular and notes reduced pages', async () => {
      outcomeOf.mockReturnValue(
        imagesDone({
          ok: true,
          outputs: [],
          extras: { images: images({ count: 1, uris: [URIS[0]!], reducedPages: 1 }) },
        }),
      );
      await open();
      expect(screen.getByText('Saved 1 image to Pictures/PDFToolkit/Report pages')).toBeTruthy();
      expect(
        screen.getByText(
          "1 large pages were saved at a lower resolution to fit this phone's memory.",
        ),
      ).toBeTruthy();
    });

    it('a recovered row says where without Open or Share', async () => {
      outcomeOf.mockReturnValue(
        imagesDone({
          ok: true,
          outputs: [],
          extras: { images: { count: 0, folder: '', uris: [], reducedPages: 0 } },
        }),
      );
      await open();
      expect(screen.getByText('Saved to Pictures/PDFToolkit')).toBeTruthy();
      expect(screen.getByLabelText('Open')).toBeDisabled();
      expect(screen.getByLabelText('Share')).toBeDisabled();
    });

    it('a cancelled job lists the images already saved', async () => {
      outcomeOf.mockReturnValue(
        imagesDone({
          ok: false,
          failure: 'cancelled',
          inputIndex: null,
          outputs: [],
          extras: { images: images({ count: 1, uris: [URIS[0]!] }) },
        }),
      );
      await open();
      expect(screen.getByText('Saved 1 image to Pictures/PDFToolkit/Report pages')).toBeTruthy();
      await press('Share');
      expect(PdfNativeModule.shareImages).toHaveBeenCalledWith([URIS[0]], 'Share images');
    });

    it('says so when a saved image is gone', async () => {
      jest
        .mocked(PdfNativeModule.viewImage)
        .mockRejectedValueOnce(nativeError('ERR_FILE_NOT_FOUND'));
      outcomeOf.mockReturnValue(
        imagesDone({ ok: true, outputs: [], extras: { images: images() } }),
      );
      await open();
      await press('Open');
      expect(screen.getByText('This file no longer exists')).toBeTruthy();
    });
  });
});
