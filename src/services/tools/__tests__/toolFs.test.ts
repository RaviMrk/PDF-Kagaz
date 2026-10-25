import { signaturesDirUri } from '../toolFs';

describe('signaturesDirUri', () => {
  it('is the signatures folder of the files directory, as a file:// URI without a trailing slash', () => {
    const dir = signaturesDirUri();
    expect(dir).toMatch(/^file:\/\/.+\/signatures$/);
  });
});
