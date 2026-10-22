/** @jest-environment node */
import { makeRow } from '@/test-utils/fileRows';

import { pickDocuments } from '../pickDocuments';

function deps(picked: Promise<string[]>) {
  const addPickedDocuments = jest.fn((uris: string[]) =>
    Promise.resolve({ rows: uris.map((u) => makeRow({ name: u.slice(-1) + '.pdf' })), failed: 1 }),
  );
  return {
    addPickedDocuments,
    deps: {
      native: { pickPdfDocuments: jest.fn(() => picked) },
      files: { getState: () => ({ addPickedDocuments }) },
    },
  };
}

describe('pickDocuments', () => {
  it('registers the picked documents and returns their ids', async () => {
    const d = deps(Promise.resolve(['content://p/1']));
    await expect(pickDocuments(true, d.deps)).resolves.toEqual({ ids: ['id-1.pdf'], failed: 1 });
    expect(d.deps.native.pickPdfDocuments).toHaveBeenCalledWith(true);
    expect(d.addPickedDocuments).toHaveBeenCalledWith(['content://p/1']);
  });
  it('returns nothing when the picker is dismissed', async () => {
    const d = deps(Promise.resolve([]));
    await expect(pickDocuments(false, d.deps)).resolves.toEqual({ ids: [], failed: 0 });
    expect(d.addPickedDocuments).not.toHaveBeenCalled();
  });
  it('returns nothing when the picker fails', async () => {
    const d = deps(Promise.reject(new Error('x')));
    await expect(pickDocuments(true, d.deps)).resolves.toEqual({ ids: [], failed: 0 });
  });
});
