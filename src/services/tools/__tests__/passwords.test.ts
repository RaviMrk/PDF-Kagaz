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
    expect(await findLockedInputs(rows, native)).toEqual([
      { index: 1, lock: 'password' },
      { index: 2, lock: 'restricted' },
    ]);
    expect(native.inspectPdf.mock.calls.map(([uri]) => uri)).toEqual(rows.map((r) => r.uri));
  });

  it('treats an input that opens with the empty password as unlocked', async () => {
    const native = createFakePdfNative();
    native.inspectPdf.mockResolvedValue('open');
    expect(await findLockedInputs(rows, native)).toEqual([]);
  });

  it('asks anyway for an input it cannot inspect', async () => {
    const native = createFakePdfNative();
    native.inspectPdf.mockImplementation((uri: string) =>
      uri === rows[1]!.uri
        ? Promise.reject(nativeError('ERR_PDF_INVALID'))
        : Promise.resolve(locks[uri]!),
    );
    expect(await findLockedInputs(rows, native)).toEqual([
      { index: 1, lock: 'password' },
      { index: 2, lock: 'restricted' },
    ]);
  });

  describe('after an encrypted failure', () => {
    afterEach(() => clearEncryptedFailures(rows.map((r) => r.id)));

    it('asks for that input even when it inspects as open or none', async () => {
      const native = createFakePdfNative();
      native.inspectPdf.mockResolvedValue('none');
      noteEncryptedFailure(rows[0]!.id);
      expect(await findLockedInputs(rows, native)).toEqual([{ index: 0, lock: 'password' }]);
      clearEncryptedFailures([rows[0]!.id]);
      expect(await findLockedInputs(rows, native)).toEqual([]);
    });
  });
});
