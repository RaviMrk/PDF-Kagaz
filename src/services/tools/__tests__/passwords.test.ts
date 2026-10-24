/** @jest-environment node */
import { createFakePdfNative, nativeError } from '@/test-utils/fakePdfNative';
import { makeRow } from '@/test-utils/fileRows';

import { clearEncryptedFailures, findLockedInputs, noteEncryptedFailure } from '../passwords';

const rows = [makeRow({ name: 'a.pdf' }), makeRow({ name: 'b.pdf' }), makeRow({ name: 'c.pdf' })];
const locks: Record<string, 'none' | 'password' | 'restricted'> = {
  [rows[0]!.uri]: 'none',
  [rows[1]!.uri]: 'password',
  [rows[2]!.uri]: 'restricted',
};

describe('findLockedInputs', () => {
  it('lists the inputs that need a password, in order', async () => {
    const native = createFakePdfNative();
    native.inspectPdf.mockImplementation((uri: string) => Promise.resolve(locks[uri]!));
    expect((await findLockedInputs(rows, native)).locked).toEqual([
      { index: 1, lock: 'password' },
      { index: 2, lock: 'restricted' },
    ]);
    expect(native.inspectPdf.mock.calls.map(([uri]) => uri)).toEqual(rows.map((r) => r.uri));
  });

  it('treats an input that opens with the empty password as unlocked', async () => {
    const native = createFakePdfNative();
    native.inspectPdf.mockResolvedValue('open');
    expect((await findLockedInputs(rows, native)).locked).toEqual([]);
  });

  describe('an input that cannot be inspected', () => {
    const inspectFails = (code: 'ERR_PDF_INVALID' | 'ERR_FILE_NOT_FOUND' | 'ERR_IO') => {
      const native = createFakePdfNative();
      native.inspectPdf.mockImplementation((uri: string) =>
        uri === rows[1]!.uri ? Promise.reject(nativeError(code)) : Promise.resolve(locks[uri]!),
      );
      return native;
    };

    it('is blocked, not prompted, when it is damaged or gone (native tools)', async () => {
      expect(await findLockedInputs(rows, inspectFails('ERR_PDF_INVALID'), 'compress')).toEqual({
        locked: [{ index: 2, lock: 'restricted' }],
        blocked: [{ index: 1, failure: 'invalid' }],
      });
      expect(await findLockedInputs(rows, inspectFails('ERR_FILE_NOT_FOUND'), 'unlock')).toEqual({
        locked: [{ index: 2, lock: 'restricted' }],
        blocked: [{ index: 1, failure: 'notFound' }],
      });
    });

    it('is asked anyway for any other error', async () => {
      expect(await findLockedInputs(rows, inspectFails('ERR_IO'), 'compress')).toEqual({
        locked: [
          { index: 1, lock: 'password' },
          { index: 2, lock: 'restricted' },
        ],
        blocked: [],
      });
    });

    it('is left to the job (no prompt, no block) when pdf-lib may still open it', async () => {
      const small = rows.map((r) => ({ ...r, sizeBytes: 1000 }));
      expect(await findLockedInputs(small, inspectFails('ERR_PDF_INVALID'), 'merge')).toEqual({
        locked: [{ index: 2, lock: 'restricted' }],
        blocked: [],
      });
    });

    it('is blocked for a routed tool whose file is over the JS cap (native route)', async () => {
      const big = rows.map((r) => ({ ...r, sizeBytes: 900_000_000 }));
      const result = await findLockedInputs(big, inspectFails('ERR_PDF_INVALID'), 'split');
      expect(result.blocked).toEqual([{ index: 1, failure: 'invalid' }]);
    });

    it('is blocked as gone for a routed tool too', async () => {
      const small = rows.map((r) => ({ ...r, sizeBytes: 1000 }));
      const result = await findLockedInputs(small, inspectFails('ERR_FILE_NOT_FOUND'), 'merge');
      expect(result.blocked).toEqual([{ index: 1, failure: 'notFound' }]);
    });
  });

  describe('after an encrypted failure', () => {
    afterEach(() => clearEncryptedFailures(rows.map((r) => r.id)));

    it('asks for that input even when it inspects as open or none', async () => {
      const native = createFakePdfNative();
      native.inspectPdf.mockResolvedValue('none');
      noteEncryptedFailure(rows[0]!.id);
      expect((await findLockedInputs(rows, native)).locked).toEqual([
        { index: 0, lock: 'password' },
      ]);
      clearEncryptedFailures([rows[0]!.id]);
      expect((await findLockedInputs(rows, native)).locked).toEqual([]);
    });
  });
});
