import { installErrorScrubber, scrubError } from '../errorScrubber';

type Handler = (error: unknown, isFatal?: boolean) => void;

function fakeErrorUtils(previous: Handler) {
  let current: Handler = previous;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: (h: Handler) => {
      current = h;
    },
    report: (error: unknown, isFatal: boolean) => current(error, isFatal),
  };
}

const RAW = 'Failed to read file:///storage/emulated/0/Download/Salary.pdf';

describe('scrubError', () => {
  it('scrubs the message and the first stack line in place', () => {
    const error = new Error(RAW);
    const out = scrubError(error);
    expect(out).toBe(error);
    expect(out.message).toBe('Failed to read <uri>');
    expect(out.stack).not.toContain('Salary');
    expect(out.stack).not.toContain('/storage');
    expect(out.stack?.split('\n')[0]).toBe('Error: Failed to read <uri>');
    expect(out.stack?.split('\n').length).toBeGreaterThan(1);
  });

  it('turns a non-Error into a scrubbed Error', () => {
    const out = scrubError('cannot open /storage/emulated/0/Salary.pdf');
    expect(out).toBeInstanceOf(Error);
    expect(out.message).not.toContain('Salary');
    expect(scrubError({ uri: 'content://x/Salary.pdf' }).message).not.toContain('Salary');
  });
});

describe('installErrorScrubber', () => {
  it('scrubs a non-fatal error, records it and passes it on scrubbed', () => {
    const previous = jest.fn<void, [unknown, boolean?]>();
    const errorUtils = fakeErrorUtils(previous);
    const record = jest.fn<void, [Error]>();
    installErrorScrubber({ record, errorUtils, hermes: undefined, dev: false });

    const error = new Error(RAW);
    errorUtils.report(error, false);
    expect(record).toHaveBeenCalledTimes(1);
    const recorded = record.mock.calls[0]![0];
    expect(recorded.message).not.toContain('Salary');
    expect(recorded.message).not.toContain('/storage');
    expect(previous).toHaveBeenCalledWith(error, false);
    expect((previous.mock.calls[0]![0] as Error).message).toBe('Failed to read <uri>');
  });

  it('a fatal error is scrubbed before the previous handler, which reports it', () => {
    const previous = jest.fn<void, [unknown, boolean?]>();
    const errorUtils = fakeErrorUtils(previous);
    const record = jest.fn();
    installErrorScrubber({ record, errorUtils, hermes: undefined, dev: false });
    errorUtils.report(new Error(RAW), true);
    expect(record).not.toHaveBeenCalled();
    const passed = previous.mock.calls[0]![0] as Error;
    expect(passed.message).toBe('Failed to read <uri>');
    expect(previous.mock.calls[0]![1]).toBe(true);
  });

  it('a non-Error throw reaches the previous handler as a scrubbed Error', () => {
    const previous = jest.fn<void, [unknown, boolean?]>();
    const errorUtils = fakeErrorUtils(previous);
    const record = jest.fn<void, [Error]>();
    installErrorScrubber({ record, errorUtils, hermes: undefined, dev: false });
    errorUtils.report('Salary.pdf at /storage/emulated/0', false);
    const passed = previous.mock.calls[0]![0] as Error;
    expect(passed).toBeInstanceOf(Error);
    expect(passed.message).not.toContain('Salary');
    expect(record.mock.calls[0]![0].message).not.toContain('/storage');
  });

  it('a throwing recorder never stops the previous handler', () => {
    const previous = jest.fn<void, [unknown, boolean?]>();
    const errorUtils = fakeErrorUtils(previous);
    installErrorScrubber({
      record: () => {
        throw new Error('boom');
      },
      errorUtils,
      hermes: undefined,
      dev: false,
    });
    expect(() => errorUtils.report(new Error('x'), false)).not.toThrow();
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('in release, records unhandled rejections scrubbed through Hermes tracking', () => {
    const enable = jest.fn();
    const record = jest.fn<void, [Error]>();
    installErrorScrubber({
      record,
      errorUtils: undefined,
      hermes: { enablePromiseRejectionTracker: enable },
      dev: false,
    });
    expect(enable).toHaveBeenCalledWith(expect.objectContaining({ allRejections: true }));
    const { onUnhandled } = enable.mock.calls[0]![0];
    onUnhandled(1, new Error(RAW));
    onUnhandled(2, 'content://media/Salary.pdf');
    expect(record).toHaveBeenCalledTimes(2);
    for (const [e] of record.mock.calls) {
      expect(e.message).not.toContain('Salary');
      expect(e.message).not.toContain('://');
    }
  });

  it('leaves the dev rejection tracker (LogBox warnings) alone', () => {
    const enable = jest.fn();
    installErrorScrubber({
      record: jest.fn(),
      errorUtils: undefined,
      hermes: { enablePromiseRejectionTracker: enable },
      dev: true,
    });
    expect(enable).not.toHaveBeenCalled();
  });
});
