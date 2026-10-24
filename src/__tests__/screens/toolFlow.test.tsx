import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { BackHandler } from 'react-native';
import path from 'path';

import { useFiles } from '@/stores/filesStore';
import { useSettings } from '@/stores/settingsStore';
import { useStorage } from '@/stores/storageStore';
import { useToolJobs, type StartResult } from '@/stores/toolJobStore';
import { openToolPreview } from '@/services/tools/toolPreview';
import { makeRow } from '@/test-utils/fileRows';
import { formatBytes } from '@/utils/fileSize';

import PdfNativeModule from '../../../modules/pdf-native';

// Router-rendering suites can exceed jest's 5 s default under load.
jest.setTimeout(20000);

jest.mock('@/db/useDatabaseReady', () => ({
  useDatabaseReady: () => ({ success: true, error: undefined }),
}));
jest.mock('@/services/files/useFileIndexLifecycle', () => ({ useFileIndexLifecycle: jest.fn() }));
jest.mock('@/services/tools/toolPreview', () => ({ openToolPreview: jest.fn() }));

const APP_DIR = path.join(__dirname, '../../../app');
const preview = jest.mocked(openToolPreview);

const a = makeRow({ name: 'a.pdf' });
const b = makeRow({ name: 'b.pdf' });
const c = makeRow({ name: 'c.pdf', folder: '', parentUri: '', source: 'intent' });
const ID_A = '0123456789abcdef';
const ID_B = 'fedcba9876543210';
const hexA = makeRow({ name: 'ha.pdf', id: ID_A });
const hexB = makeRow({ name: 'hb.pdf', id: ID_B, pageCount: 10 });

let start: jest.Mock<StartResult>;
let cancel: jest.Mock;

async function open(initialUrl: string) {
  // RNTL v14: renderRouter's getPathname helper lives on the returned thenable itself.
  const pending = renderRouter(APP_DIR, { initialUrl });
  await pending;
  await act(async () => {});
  return {
    pathname: () => pending.getPathname(),
    params: () => pending.getSearchParams(),
  };
}

const press = async (label: string) => {
  await fireEvent.press(screen.getByLabelText(label));
  await act(async () => {});
};

describe('tool flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useSettings.setState({ onboardingDone: true });
    useStorage.setState({ mode: 'full', roots: [], canRequestFullAccess: true });
    useFiles.setState({ files: [a, b, c, hexA, hexB], status: 'idle', requestThumb: jest.fn() });
    start = jest.fn((): StartResult => ({ ok: true, jobId: 'j1' }));
    cancel = jest.fn();
    useToolJobs.setState({ active: null, last: null, start, cancel });
    preview.mockResolvedValue({
      ok: true,
      preview: { fileUri: 'file:///cache/p.pdf', pageCount: 10, close: jest.fn() },
    });
    jest.mocked(PdfNativeModule.inspectPdf).mockResolvedValue('none');
    jest.mocked(PdfNativeModule.checkPdfPassword).mockResolvedValue('ok');
  });

  it('picks, orders and merges, then follows the job to the result', async () => {
    const r = await open('/tools');
    await press('Merge');
    expect(r.pathname()).toBe('/tool/merge');
    expect(screen.getByText('Choose PDFs')).toBeTruthy();
    expect(screen.getByLabelText('Next')).toBeDisabled();
    await press('Select a.pdf');
    await press('Select c.pdf');
    expect(screen.getByText('2 selected')).toBeTruthy();
    await press('Next');
    expect(screen.getByText('Arrange files')).toBeTruthy();
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('c.pdf')).toBeTruthy();
    expect(screen.queryByText('b.pdf')).toBeNull();
    await press('Move c.pdf up');
    await press('Merge 2 PDFs');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'merge', inputIds: ['id-c.pdf', 'id-a.pdf'] },
      expect.any(Function),
    );

    await act(async () => {
      useToolJobs.setState({
        active: { jobId: 'j1', toolId: 'merge', phase: 'processing', fraction: 0.5 },
      });
    });
    expect(screen.getByText('Merging PDFs')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();

    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'j1',
          toolId: 'merge',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/result');
    expect(r.params()).toEqual(expect.objectContaining({ jobId: 'j1' }));
  });

  it('keeps the job running when the sheet is hidden', async () => {
    const r = await open('/tools');
    await press('Merge');
    await press('Select a.pdf');
    await press('Select b.pdf');
    await press('Next');
    await press('Merge 2 PDFs');
    await act(async () => {
      useToolJobs.setState({
        active: { jobId: 'j1', toolId: 'merge', phase: 'preparing', fraction: 0 },
      });
    });
    await press('Continue in background');
    expect(r.pathname()).not.toBe('/tool/merge');
    expect(cancel).not.toHaveBeenCalled();
  });

  it('cancels from the sheet', async () => {
    await open('/tools');
    await press('Merge');
    await press('Select a.pdf');
    await press('Select b.pdf');
    await press('Next');
    await press('Merge 2 PDFs');
    await act(async () => {
      useToolJobs.setState({
        active: { jobId: 'j1', toolId: 'merge', phase: 'preparing', fraction: 0 },
      });
    });
    await press('Cancel');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('opens at options with valid prefilled inputs', async () => {
    await open(`/tool/merge?inputs=${ID_A},${ID_B}`);
    expect(screen.getByText('Arrange files')).toBeTruthy();
    expect(screen.getByText('ha.pdf')).toBeTruthy();
    expect(screen.getByText('hb.pdf')).toBeTruthy();
  });

  it('Back in options returns to pick when the flow started there', async () => {
    await open('/tool/merge');
    await press('Select a.pdf');
    await press('Select b.pdf');
    await press('Next');
    await press('Back');
    expect(screen.getByText('Choose PDFs')).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
  });

  it('hardware back in options returns to pick, then leaves', async () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    const handlers = new Set<BackListener>();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    });
    const pressBack = () =>
      [...handlers].reverse().some((h) => h({} as Parameters<BackListener>[0]) === true);
    await open('/tool/merge');
    await press('Select a.pdf');
    await press('Select b.pdf');
    await press('Next');
    let handled = false;
    await act(async () => {
      handled = pressBack();
    });
    expect(handled).toBe(true);
    expect(screen.getByText('Choose PDFs')).toBeTruthy();
    expect(pressBack()).toBe(false);
  });

  it('adds and selects browsed files', async () => {
    jest.mocked(PdfNativeModule.pickPdfDocuments).mockResolvedValueOnce(['content://p/new.pdf']);
    const picked = makeRow({ name: 'new.pdf', folder: '', parentUri: '', source: 'intent' });
    const addPickedDocuments = jest.fn(async () => {
      useFiles.setState((s) => ({ files: [...s.files, picked] }));
      return { rows: [picked], failed: 0 };
    });
    useFiles.setState({ addPickedDocuments });
    await open('/tool/merge');
    await press('Browse files…');
    expect(PdfNativeModule.pickPdfDocuments).toHaveBeenCalledWith(true);
    expect(addPickedDocuments).toHaveBeenCalledWith(['content://p/new.pdf']);
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByLabelText('Select new.pdf')).toBeChecked();
  });

  it('says when some browsed files could not be added', async () => {
    jest.mocked(PdfNativeModule.pickPdfDocuments).mockResolvedValueOnce(['content://p/x.pdf']);
    useFiles.setState({ addPickedDocuments: jest.fn(async () => ({ rows: [], failed: 1 })) });
    await open('/tool/merge');
    await press('Browse files…');
    expect(screen.getByText("Some files couldn't be added")).toBeTruthy();
    expect(screen.getByText('0 selected')).toBeTruthy();
  });

  it('blocks merging over the 1 GB total cap', async () => {
    const heavy = ['x', 'y', 'z'].map((n) => makeRow({ name: `${n}.pdf`, sizeBytes: 400_000_000 }));
    useFiles.setState({ files: heavy });
    await open('/tool/merge');
    for (const n of ['x', 'y', 'z']) await press(`Select ${n}.pdf`);
    expect(
      screen.getByText(
        `These files are over ${formatBytes(1_073_741_824)} together. Use fewer files at a time.`,
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText('Next')).toBeDisabled();
  });

  it('splits by page ranges', async () => {
    await open(`/tool/split?inputs=${ID_A}`);
    expect(preview).toHaveBeenCalledWith(hexA);
    expect(screen.getByText('10 pages')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Ranges (one file each)'), '1-3, 5');
    expect(screen.getByText('Makes 2 files')).toBeTruthy();
    await press('Split');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'split', inputIds: [ID_A], split: { mode: 'ranges', ranges: '1-3, 5' } },
      expect.any(Function),
    );
  });

  it('rejects ranges outside the PDF', async () => {
    await open(`/tool/split?inputs=${ID_A}`);
    await fireEvent.changeText(screen.getByLabelText('Ranges (one file each)'), '9-12');
    expect(screen.getByText('Pages must be from 1 to 10')).toBeTruthy();
    expect(screen.getByLabelText('Split')).toBeDisabled();
  });

  it('splits every N pages', async () => {
    await open(`/tool/split?inputs=${ID_A}`);
    await press('Every N pages');
    await fireEvent.changeText(screen.getByLabelText('Pages per file'), '0');
    expect(screen.getByText('Enter a number from 1 to 9')).toBeTruthy();
    expect(screen.getByLabelText('Split')).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Pages per file'), '4');
    expect(screen.getByText('Makes 3 files')).toBeTruthy();
    await press('Split');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'split', inputIds: [ID_A], split: { mode: 'everyN', n: 4 } },
      expect.any(Function),
    );
  });

  it('extracts the picked pages', async () => {
    await open(`/tool/split?inputs=${ID_A}`);
    await press('Extract pages');
    expect(screen.getByText('Selected pages go into one new PDF')).toBeTruthy();
    expect(screen.getByLabelText('Split')).toBeDisabled();
    await press('Page 2');
    await press('Page 3');
    await press('Page 7');
    await press('Split');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'split', inputIds: [ID_A], split: { mode: 'extract', ranges: '2-3, 7' } },
      expect.any(Function),
    );
  });

  it('shows why a PDF cannot be split and offers no Split button', async () => {
    preview.mockResolvedValue({ ok: false, failure: 'encrypted', lock: 'password' });
    await open(`/tool/split?inputs=${ID_A}`);
    // The password prompt comes first; without a password the file cannot be split.
    await press('Cancel');
    expect(
      screen.getByText(
        '"ha.pdf" is password-protected. Start the tool again and enter its password.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Split')).toBeNull();
  });

  it('explains a restricted file to split when its owner password prompt is cancelled', async () => {
    preview.mockResolvedValue({ ok: false, failure: 'restricted', lock: 'restricted' });
    await open(`/tool/split?inputs=${ID_A}`);
    await press('Cancel');
    expect(
      screen.getByText(
        "This PDF doesn't allow changes. Enter its owner password to use it in a tool.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/password-protected/)).toBeNull();
    expect(screen.queryByLabelText('Split')).toBeNull();
  });

  it('closes the preview when leaving split', async () => {
    const close = jest.fn();
    preview.mockResolvedValue({
      ok: true,
      preview: { fileUri: 'file:///cache/p.pdf', pageCount: 10, close },
    });
    const r = await open(`/tool/split?inputs=${ID_A}`);
    expect(close).not.toHaveBeenCalled();
    await press('Back');
    expect(r.pathname()).not.toBe('/tool/split');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('sends organise to its page editor after picking one file', async () => {
    const r = await open('/tool/organize');
    expect(screen.getByText('Choose a PDF')).toBeTruthy();
    await press('Select a.pdf');
    await press('Select b.pdf');
    expect(screen.getByLabelText('Select a.pdf')).not.toBeChecked();
    await press('Select a.pdf');
    await press('Next');
    expect(r.pathname()).toBe('/tool/organize/id-a.pdf');
  });

  it('compresses one picked file at the chosen level', async () => {
    const big = makeRow({ name: 'big.pdf', sizeBytes: 2_500_000 });
    useFiles.setState({ files: [big] });
    const r = await open('/tools');
    await press('Compress');
    expect(r.pathname()).toBe('/tool/compress');
    await press('Select big.pdf');
    await press('Next');
    expect(screen.getByText(`Now ${formatBytes(2_500_000)}`)).toBeTruthy();
    expect(screen.getByLabelText('Medium')).toBeChecked();
    expect(screen.getByText('Good balance for sharing.')).toBeTruthy();
    await press('High');
    expect(screen.getByText('Smallest file. Images get softer.')).toBeTruthy();
    await press('Compress');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'compress', inputIds: [big.id], level: 'high' },
      expect.any(Function),
    );
  });

  it('saves the chosen pages as PNG images at 300 DPI', async () => {
    const r = await open('/tools');
    await press('PDF to images');
    expect(r.pathname()).toBe('/tool/pdf-to-images');
    await press('Select ha.pdf');
    await press('Next');
    expect(screen.getByLabelText('JPG')).toBeChecked();
    expect(screen.getByLabelText('150 DPI')).toBeChecked();
    expect(screen.getByText('Higher DPI makes sharper, bigger images.')).toBeTruthy();
    expect(screen.getByLabelText('All pages')).toBeChecked();
    expect(screen.getByLabelText('Save 10 images')).toBeEnabled();
    await press('PNG');
    await press('300 DPI');
    await press('Choose pages');
    expect(screen.getByLabelText('Save images')).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5, 8-10'), '2');
    await act(async () => {});
    expect(screen.getByLabelText('Save 1 image')).toBeEnabled();
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. 1-3, 5, 8-10'), '2-3');
    await act(async () => {});
    await press('Save 2 images');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'pdf-to-images', inputIds: [ID_A], format: 'png', dpi: 300, pages: [2, 3] },
      expect.any(Function),
    );
  });

  it('saves every page as JPG by default and passes the password that opened the file', async () => {
    preview.mockImplementation((_row, opts) =>
      Promise.resolve(
        opts?.password === 'secret'
          ? {
              ok: true as const,
              preview: { fileUri: 'file:///cache/p.open.pdf', pageCount: 4, close: jest.fn() },
            }
          : { ok: false as const, failure: 'encrypted' as const, lock: 'password' as const },
      ),
    );
    await open(`/tool/pdf-to-images?inputs=${ID_A}`);
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
    await press('Use');
    await press('Save 4 images');
    expect(start).toHaveBeenCalledWith(
      {
        toolId: 'pdf-to-images',
        inputIds: [ID_A],
        format: 'jpg',
        dpi: 150,
        pages: null,
        passwords: { 0: 'secret' },
      },
      expect.any(Function),
    );
  });

  it('shows coming soon for tools that are not ready', async () => {
    await open('/tool/watermark');
    expect(screen.getByText('Coming soon')).toBeTruthy();
    expect(screen.queryByText('Choose PDFs')).toBeNull();
  });

  it('drops a selected file that leaves the library', async () => {
    await open('/tool/merge');
    await press('Select a.pdf');
    await press('Select b.pdf');
    await press('Select c.pdf');
    expect(screen.getByText('3 selected')).toBeTruthy();
    await act(async () => {
      useFiles.setState((s) => ({ files: s.files.filter((f) => f.id !== c.id) }));
    });
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByLabelText('Next')).toBeEnabled();
    await press('Next');
    await press('Merge 2 PDFs');
    expect(start).toHaveBeenCalledWith(
      { toolId: 'merge', inputIds: ['id-a.pdf', 'id-b.pdf'] },
      expect.any(Function),
    );
  });

  it('a vanished selection does not block the selection limit or Next', async () => {
    await open('/tool/split');
    await press('Select a.pdf');
    await act(async () => {
      useFiles.setState((s) => ({ files: s.files.filter((f) => f.id !== a.id) }));
    });
    expect(screen.getByLabelText('Next')).toBeDisabled();
    await press('Select b.pdf');
    expect(screen.getByLabelText('Next')).toBeEnabled();
  });

  it('returns to pick when the split file vanishes at options', async () => {
    await open(`/tool/split?inputs=${ID_A}`);
    expect(screen.getByText('10 pages')).toBeTruthy();
    await act(async () => {
      useFiles.setState((s) => ({ files: s.files.filter((f) => f.id !== ID_A) }));
    });
    expect(screen.getByText('Choose a PDF')).toBeTruthy();
    expect(screen.getByLabelText('Next')).toBeDisabled();
  });

  it('starts once when Run is tapped twice before a re-render', async () => {
    await open(`/tool/merge?inputs=${ID_A},${ID_B}`);
    const run = screen.getByLabelText('Merge 2 PDFs');
    // Two accessibility clicks in one batch: neither sees the other's re-render.
    const click = () => run.props.onClick({ nativeEvent: {}, persist() {} });
    await act(async () => {
      click();
      click();
    });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not leave for a job it did not start', async () => {
    const r = await open(`/tool/merge?inputs=${ID_A},${ID_B}`);
    await press('Merge 2 PDFs');
    await act(async () => {
      useToolJobs.setState({
        active: null,
        last: {
          jobId: 'other',
          toolId: 'merge',
          inputIds: [],
          outcome: { ok: true, outputs: [] },
          seen: false,
        },
      });
    });
    expect(r.pathname()).toBe('/tool/merge');
  });

  it('offers no every-N mode for a one-page PDF', async () => {
    preview.mockResolvedValue({
      ok: true,
      preview: { fileUri: 'file:///cache/p.pdf', pageCount: 1, close: jest.fn() },
    });
    await open(`/tool/split?inputs=${ID_A}`);
    expect(screen.getByLabelText('Page ranges')).toBeTruthy();
    expect(screen.getByLabelText('Extract pages')).toBeTruthy();
    expect(screen.queryByLabelText('Every N pages')).toBeNull();
  });

  it('shows coming soon for an unknown tool', async () => {
    await open('/tool/nope');
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('says so when another tool is running', async () => {
    start.mockReturnValue({ ok: false, reason: 'busy' });
    await open(`/tool/merge?inputs=${ID_A},${ID_B}`);
    await press('Merge 2 PDFs');
    expect(screen.getByText('Another tool is still running. Wait for it to finish.')).toBeTruthy();
  });
  describe('password-protected inputs', () => {
    it('asks for a locked merge input on Run; Cancel starts nothing', async () => {
      jest
        .mocked(PdfNativeModule.inspectPdf)
        .mockImplementation((uri: string) => Promise.resolve(uri === b.uri ? 'password' : 'none'));
      jest
        .mocked(PdfNativeModule.checkPdfPassword)
        .mockImplementation((_uri: string, pw: string) =>
          Promise.resolve(pw === 'secret' ? 'ok' : 'wrong'),
        );
      await open('/tools');
      await press('Merge');
      await press('Select a.pdf');
      await press('Select b.pdf');
      await press('Next');
      expect(screen.queryByPlaceholderText('Password')).toBeNull();
      await press('Merge 2 PDFs');
      expect(
        screen.getByText('"b.pdf" is protected. Enter its password to use it in this tool.'),
      ).toBeTruthy();
      await press('Cancel');
      expect(start).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText('Password')).toBeNull();

      await press('Merge 2 PDFs');
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'nope');
      await press('Use');
      expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
      expect(start).not.toHaveBeenCalled();
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Use');
      expect(start).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledWith(
        { toolId: 'merge', inputIds: [a.id, b.id], passwords: { 1: 'secret' } },
        expect.any(Function),
      );
    });

    it('protects a picked file with the typed password', async () => {
      await open(`/tool/protect?inputs=${ID_A}`);
      await fireEvent.changeText(screen.getByLabelText('New password'), 'hunter22');
      await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'hunter22');
      await press('Protect');
      expect(start).toHaveBeenCalledWith(
        { toolId: 'protect', inputIds: [ID_A], newPassword: 'hunter22' },
        expect.any(Function),
      );
    });

    it('asks for the current password of a locked file to protect', async () => {
      jest.mocked(PdfNativeModule.inspectPdf).mockResolvedValue('password');
      jest
        .mocked(PdfNativeModule.checkPdfPassword)
        .mockImplementation((_uri: string, pw: string) =>
          Promise.resolve(pw === 'secret' ? 'ok' : 'wrong'),
        );
      await open(`/tool/protect?inputs=${ID_A}`);
      await fireEvent.changeText(screen.getByLabelText('New password'), 'hunter22');
      await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'hunter22');
      await press('Protect');
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Use');
      expect(start).toHaveBeenCalledWith(
        {
          toolId: 'protect',
          inputIds: [ID_A],
          newPassword: 'hunter22',
          passwords: { 0: 'secret' },
        },
        expect.any(Function),
      );
    });

    it('says a PDF with no password has none to remove and disables Run', async () => {
      await open(`/tool/unlock?inputs=${ID_A}`);
      expect(screen.getByText('This PDF has no password.')).toBeTruthy();
      expect(screen.getByLabelText('Remove password')).toBeDisabled();
      expect(start).not.toHaveBeenCalled();
    });

    it('asks for the password of a locked file to remove, then starts the unlock', async () => {
      jest.mocked(PdfNativeModule.inspectPdf).mockResolvedValue('password');
      jest
        .mocked(PdfNativeModule.checkPdfPassword)
        .mockImplementation((_uri: string, pw: string) =>
          Promise.resolve(pw === 'secret' ? 'ok' : 'wrong'),
        );
      await open(`/tool/unlock?inputs=${ID_A}`);
      expect(screen.getByText("You'll need the PDF's current password.")).toBeTruthy();
      await press('Remove password');
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Use');
      expect(start).toHaveBeenCalledWith(
        { toolId: 'unlock', inputIds: [ID_A], passwords: { 0: 'secret' } },
        expect.any(Function),
      );
    });

    it('asks for a locked file to compress on Run, then passes its password', async () => {
      jest.mocked(PdfNativeModule.inspectPdf).mockResolvedValue('password');
      jest
        .mocked(PdfNativeModule.checkPdfPassword)
        .mockImplementation((_uri: string, pw: string) =>
          Promise.resolve(pw === 'secret' ? 'ok' : 'wrong'),
        );
      await open(`/tool/compress?inputs=${ID_A}`);
      await press('Low');
      await press('Compress');
      expect(
        screen.getByText('"ha.pdf" is protected. Enter its password to use it in this tool.'),
      ).toBeTruthy();
      await press('Cancel');
      expect(start).not.toHaveBeenCalled();
      await press('Compress');
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Use');
      expect(start).toHaveBeenCalledWith(
        { toolId: 'compress', inputIds: [ID_A], level: 'low', passwords: { 0: 'secret' } },
        expect.any(Function),
      );
    });

    it('asks for the password of a locked file to split, then passes it with the job', async () => {
      preview.mockImplementation((_row, opts) =>
        Promise.resolve(
          opts?.password === 'secret'
            ? {
                ok: true as const,
                preview: { fileUri: 'file:///cache/p.open.pdf', pageCount: 10, close: jest.fn() },
              }
            : {
                ok: false as const,
                failure: opts?.password ? ('wrongPassword' as const) : ('encrypted' as const),
                lock: 'password' as const,
              },
        ),
      );
      await open(`/tool/split?inputs=${ID_A}`);
      expect(
        screen.getByText('"ha.pdf" is protected. Enter its password to use it in this tool.'),
      ).toBeTruthy();
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'nope');
      await press('Use');
      expect(screen.getByText('Wrong password. Try again.')).toBeTruthy();
      await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret');
      await press('Use');
      expect(preview).toHaveBeenLastCalledWith(hexA, { password: 'secret' });
      expect(screen.getByText('10 pages')).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText('Ranges (one file each)'), '1-3');
      await press('Split');
      expect(start).toHaveBeenCalledWith(
        {
          toolId: 'split',
          inputIds: [ID_A],
          split: { mode: 'ranges', ranges: '1-3' },
          passwords: { 0: 'secret' },
        },
        expect.any(Function),
      );
    });
  });
});
