import { outputBaseName, validatePdfFileName } from '../fileName';

describe('validatePdfFileName', () => {
  it('trims and appends .pdf', () => {
    expect(validatePdfFileName(' Notes ')).toEqual({ ok: true, name: 'Notes.pdf' });
    expect(validatePdfFileName('अहवाल २')).toEqual({ ok: true, name: 'अहवाल २.pdf' });
  });
  it('keeps an existing .pdf extension in any case', () => {
    expect(validatePdfFileName('a.PDF')).toEqual({ ok: true, name: 'a.PDF' });
  });
  it('rejects empty', () => {
    expect(validatePdfFileName('')).toEqual({ ok: false, reason: 'empty' });
    expect(validatePdfFileName('   ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('rejects forbidden characters, control chars and a leading dot', () => {
    for (const bad of [
      'a/b',
      'a\\b',
      'a:b',
      'a*b',
      'a?b',
      'a"b',
      'a<b',
      'a>b',
      'a|b',
      'a\u0000b',
      'a\nb',
      '.hidden',
    ]) {
      expect(validatePdfFileName(bad)).toEqual({ ok: false, reason: 'invalidChars' });
    }
  });
  it('rejects names over 255 UTF-8 bytes', () => {
    expect(validatePdfFileName('अ'.repeat(300))).toEqual({ ok: false, reason: 'tooLong' });
    expect(validatePdfFileName('a'.repeat(251))).toEqual({
      ok: true,
      name: `${'a'.repeat(251)}.pdf`,
    });
    expect(validatePdfFileName('a'.repeat(252))).toEqual({ ok: false, reason: 'tooLong' });
  });
});

describe('outputBaseName', () => {
  it('drops a trailing .pdf in any case', () => {
    expect(outputBaseName('Report.PDF')).toBe('Report');
  });
  it('replaces path and reserved characters', () => {
    expect(outputBaseName('a/b:c?.pdf')).toBe('a_b_c_');
  });
  it('strips leading dots and bidi controls', () => {
    expect(outputBaseName('..hidden.pdf')).toBe('hidden');
    expect(outputBaseName('\u202Eevil.pdf')).toBe('evil');
  });
  it('caps at 200 UTF-8 bytes on a code-point boundary', () => {
    expect(outputBaseName('अ'.repeat(100) + '.pdf')).toBe('अ'.repeat(66));
  });
  it('falls back to document', () => {
    expect(outputBaseName('.pdf')).toBe('document');
  });
});
