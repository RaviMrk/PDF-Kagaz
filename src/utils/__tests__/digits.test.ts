import { toAsciiDigits } from '../digits';

describe('toAsciiDigits', () => {
  it('maps Devanagari digits and leaves the rest', () => {
    expect(toAsciiDigits('१-३, ५७ a')).toBe('1-3, 57 a');
  });
});
