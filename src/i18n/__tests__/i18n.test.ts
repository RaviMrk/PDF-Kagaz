import { initI18n, resolveLanguage } from '@/i18n';

describe('resolveLanguage', () => {
  it('uses the device locale when no preference is set', () => {
    expect(resolveLanguage(null, ['mr-IN'])).toBe('mr');
  });
  it('falls back to en for unsupported device locales', () => {
    expect(resolveLanguage(null, ['fr-FR'])).toBe('en');
  });
  it('prefers the saved language over the device locale', () => {
    expect(resolveLanguage('hi', ['en-US'])).toBe('hi');
  });
  it('ignores an unsupported saved language', () => {
    expect(resolveLanguage('xx', ['en-US'])).toBe('en');
  });
});

describe('initI18n', () => {
  it('falls back to English strings when mr is empty', () => {
    expect(initI18n('mr').t('tabs.home')).toBe('Home');
  });
  it('returns English strings for en', () => {
    expect(initI18n('en').t('tabs.files')).toBe('Files');
  });
});

describe('counted strings', () => {
  const t = initI18n('en').t;
  it.each([
    ['split.pageCount', '1 page', '3 pages'],
    ['files.scanning', 'Scanning… 1 PDF found', 'Scanning… 3 PDFs found'],
    ['merge.run', 'Merge 1 PDF', 'Merge 3 PDFs'],
  ])('%s has a singular form', (key, one, many) => {
    expect(t(key, { count: 1 })).toBe(one);
    expect(t(key, { count: 3 })).toBe(many);
  });
});
