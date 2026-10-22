import { displayName } from '../displayName';

describe('displayName', () => {
  it('removes bidi override controls', () => {
    expect(displayName('\u202Efdp.exe')).toBe('fdp.exe');
    expect(displayName('\u2066x\u2069.pdf')).toBe('x.pdf');
  });

  it('removes C0 and C1 control characters', () => {
    expect(displayName('a\u0000b\u001F.pdf')).toBe('ab.pdf');
    expect(displayName('a\u007Fb\u009F.pdf')).toBe('ab.pdf');
  });

  it('keeps ordinary text, including Devanagari', () => {
    expect(displayName('अहवाल.pdf')).toBe('अहवाल.pdf');
  });

  it('falls back to document.pdf when nothing is left', () => {
    expect(displayName('\u200E\u200F')).toBe('document.pdf');
    expect(displayName('  ')).toBe('document.pdf');
  });
});
