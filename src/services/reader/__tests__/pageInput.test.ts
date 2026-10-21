import { parsePageInput } from '../pageInput';

describe('parsePageInput', () => {
  it('parses ascii, padded and Devanagari digits', () => {
    expect(parsePageInput('57', 200)).toBe(57);
    expect(parsePageInput(' 57 ', 200)).toBe(57);
    expect(parsePageInput('५७', 200)).toBe(57);
  });
  it.each(['0', '201', '5a', '', '-3', '5.5', '   '])('rejects %p', (t) => {
    expect(parsePageInput(t, 200)).toBeNull();
  });
});
