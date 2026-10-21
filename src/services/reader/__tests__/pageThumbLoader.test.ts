import { nativeError } from '../../../test-utils/fakePdfNative';
import { createPageThumbLoader } from '../pageThumbLoader';

function deferred() {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setImmediate(r));

describe('createPageThumbLoader', () => {
  it('runs at most 2 at once, last requested first', async () => {
    const calls: { page: number; d: ReturnType<typeof deferred> }[] = [];
    const native = {
      renderReaderThumbnail: jest.fn((_u: string, page: number) => {
        const d = deferred();
        calls.push({ page, d });
        return d.promise;
      }),
    };
    const loader = createPageThumbLoader({ fileUri: 'file:///a', width: 100, native });
    for (let p = 1; p <= 5; p++) loader.request(p, jest.fn());
    expect(calls.map((c) => c.page)).toEqual([1, 2]);
    calls[0]!.d.resolve('t1');
    await flush();
    expect(calls.map((c) => c.page)).toEqual([1, 2, 5]);
    expect(loader.get(1)).toBe('t1');
    expect(loader.get(4)).toBeUndefined();
  });

  it('serves repeats from cache', async () => {
    const native = { renderReaderThumbnail: jest.fn().mockResolvedValue('t3') };
    const loader = createPageThumbLoader({ fileUri: 'file:///a', width: 100, native });
    const first = jest.fn();
    loader.request(3, first);
    await flush();
    expect(first).toHaveBeenCalledWith('t3');
    const second = jest.fn();
    loader.request(3, second);
    expect(second).toHaveBeenCalledWith('t3');
    expect(native.renderReaderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('after ERR_PDF_ENCRYPTED resolves everything null with one native call', async () => {
    const native = {
      renderReaderThumbnail: jest.fn().mockRejectedValue(nativeError('ERR_PDF_ENCRYPTED')),
    };
    const loader = createPageThumbLoader({
      fileUri: 'file:///a',
      width: 100,
      concurrency: 1,
      native,
    });
    const cbs = [1, 2, 3, 4, 5].map((p) => {
      const cb = jest.fn();
      loader.request(p, cb);
      return cb;
    });
    await flush();
    cbs.forEach((cb) => expect(cb).toHaveBeenCalledWith(null));
    const late = jest.fn();
    loader.request(9, late);
    expect(late).toHaveBeenCalledWith(null);
    expect(native.renderReaderThumbnail).toHaveBeenCalledTimes(1);
  });

  it('other errors only null that page', async () => {
    const native = {
      renderReaderThumbnail: jest
        .fn()
        .mockRejectedValueOnce(nativeError('ERR_IO'))
        .mockResolvedValueOnce('t2'),
    };
    const loader = createPageThumbLoader({ fileUri: 'file:///a', width: 100, native });
    loader.request(1, jest.fn());
    loader.request(2, jest.fn());
    await flush();
    expect(loader.get(1)).toBeNull();
    expect(loader.get(2)).toBe('t2');
  });

  it('cancelPending drops queued pages', async () => {
    const d = deferred();
    const native = { renderReaderThumbnail: jest.fn().mockReturnValue(d.promise) };
    const loader = createPageThumbLoader({
      fileUri: 'file:///a',
      width: 100,
      concurrency: 1,
      native,
    });
    const queued = jest.fn();
    loader.request(1, jest.fn());
    loader.request(2, queued);
    loader.cancelPending();
    d.resolve('t');
    await flush();
    expect(native.renderReaderThumbnail).toHaveBeenCalledTimes(1);
    expect(queued).not.toHaveBeenCalled();
    expect(loader.get(2)).toBeUndefined();
  });
});
