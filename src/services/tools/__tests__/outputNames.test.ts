import { initI18n } from '@/i18n';

import { mergedName, organisedName, splitNames } from '../outputNames';

const i18n = initI18n('en');
const tr = (key: string, options?: Record<string, unknown>): string => i18n.t(key, options);

describe('outputNames', () => {
  it('names merged output', () => {
    expect(mergedName('Report.pdf', tr)).toBe('Report merged.pdf');
  });
  it('names range splits', () => {
    expect(splitNames('a.pdf', 'ranges', [[1, 2, 3], [5]], tr)).toEqual([
      'a pages 1-3.pdf',
      'a page 5.pdf',
    ]);
  });
  it('names every-N parts and extracts', () => {
    expect(splitNames('a.pdf', 'everyN', [[1, 2], [3]], tr)).toEqual([
      'a part 1.pdf',
      'a part 2.pdf',
    ]);
    expect(splitNames('a.pdf', 'extract', [[1, 2], [5]], tr)).toEqual(['a extracted.pdf']);
  });
  it('strips bidi controls from the input name', () => {
    expect(organisedName('‮x.pdf', tr)).toBe('x organised.pdf');
  });
});
