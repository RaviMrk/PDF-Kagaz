import { createThumbnailQueue, type ThumbResult } from '../thumbnailQueue';

function err(code: string): Error {
  return Object.assign(new Error(code), { code });
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup(opts: { concurrency?: number; thumb?: (uri: string) => Promise<string> } = {}) {
  const results: ThumbResult[] = [];
  const generateThumbnail = jest.fn(opts.thumb ?? (async (uri: string) => `/t/${uri}.png`));
  const getPageCount = jest.fn(async () => 3);
  const queue = createThumbnailQueue({
    native: { generateThumbnail, getPageCount },
    width: 200,
    concurrency: opts.concurrency,
    onResult: (r) => results.push(r),
  });
  return { queue, results, generateThumbnail, getPageCount };
}

describe('thumbnailQueue', () => {
  it('generates a thumbnail and reports page count', async () => {
    const { queue, results, generateThumbnail } = setup();
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(generateThumbnail).toHaveBeenCalledWith('u1', 1, 200);
    expect(results).toEqual([
      {
        id: '1',
        thumbPath: '/t/u1.png',
        pageCount: 3,
        isEncrypted: false,
        missing: false,
        invalid: false,
        modifiedAt: 1,
        sizeBytes: 10,
      },
    ]);
  });

  it('reports encrypted files without generating', async () => {
    const { queue, results, generateThumbnail, getPageCount } = setup();
    getPageCount.mockRejectedValueOnce(err('ERR_PDF_ENCRYPTED'));
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(generateThumbnail).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        id: '1',
        thumbPath: null,
        pageCount: null,
        isEncrypted: true,
        missing: false,
        invalid: false,
        modifiedAt: 1,
        sizeBytes: 10,
      },
    ]);
  });

  it('never retries invalid files', async () => {
    const { queue, results, generateThumbnail } = setup({
      thumb: async () => {
        throw err('ERR_PDF_INVALID');
      },
    });
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(generateThumbnail).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      thumbPath: null,
      pageCount: null,
      isEncrypted: false,
      missing: false,
      invalid: true,
    });
  });

  it('flags missing files', async () => {
    const { queue, results, getPageCount } = setup();
    getPageCount.mockRejectedValueOnce(err('ERR_FILE_NOT_FOUND'));
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(results[0]).toMatchObject({ id: '1', missing: true, invalid: false, thumbPath: null });
  });

  it('gives no result and no retry on other errors', async () => {
    const { queue, results, getPageCount } = setup();
    getPageCount.mockRejectedValueOnce(err('ERR_IO'));
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(results).toHaveLength(0);
    expect(getPageCount).toHaveBeenCalledTimes(1);
  });

  it('runs a duplicate request of a queued id once', async () => {
    const { queue, generateThumbnail } = setup({ concurrency: 1 });
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    queue.request({ id: '2', uri: 'u2', modifiedAt: 1, sizeBytes: 10 });
    queue.request({ id: '2', uri: 'u2', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(generateThumbnail).toHaveBeenCalledTimes(2);
  });

  it('limits in-flight work and runs the latest request first after the in-flight ones', async () => {
    const gates: (() => void)[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const started: string[] = [];
    const { queue } = setup({
      concurrency: 2,
      thumb: (uri) => {
        started.push(uri);
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise<string>((resolve) => {
          gates.push(() => {
            inFlight--;
            resolve(`/t/${uri}`);
          });
        });
      },
    });
    for (const n of [1, 2, 3, 4, 5])
      queue.request({ id: `${n}`, uri: `u${n}`, modifiedAt: 1, sizeBytes: 10 });
    await flush();
    expect(started).toEqual(['u1', 'u2']);
    gates.shift()?.();
    await flush();
    expect(started).toEqual(['u1', 'u2', 'u5']);
    gates.shift()?.();
    await flush();
    expect(started).toEqual(['u1', 'u2', 'u5', 'u4']);
    gates.shift()?.();
    await flush();
    expect(started).toEqual(['u1', 'u2', 'u5', 'u4', 'u3']);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  it('clear() drops pending requests', async () => {
    const gates: (() => void)[] = [];
    const { queue, generateThumbnail } = setup({
      concurrency: 1,
      thumb: (uri) => new Promise<string>((resolve) => gates.push(() => resolve(uri))),
    });
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    queue.request({ id: '2', uri: 'u2', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    queue.clear();
    gates[0]?.();
    await flush();
    expect(generateThumbnail).toHaveBeenCalledTimes(1);
  });

  it('re-requests the same id once its content version changes', async () => {
    const { queue, results, generateThumbnail } = setup();
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    await flush();
    queue.request({ id: '1', uri: 'u1', modifiedAt: 1, sizeBytes: 10 });
    queue.request({ id: '1', uri: 'u1', modifiedAt: 2, sizeBytes: 10 });
    await flush();
    expect(generateThumbnail).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.modifiedAt)).toEqual([1, 2]);
  });
});
