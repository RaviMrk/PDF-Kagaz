import { initI18n } from '@/i18n';

import {
  customOutputName,
  imagesName,
  mergedName,
  nameStamp,
  organisedName,
  scanName,
  splitNames,
} from '../outputNames';

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

describe('image and scan names', () => {
  const ms = new Date(2026, 9, 23, 14, 5).getTime();
  it('formats the local stamp with dots', () => {
    expect(nameStamp(ms)).toBe('2026-10-23 14.05');
  });
  it('names image and scan outputs', () => {
    expect(imagesName(ms, tr)).toBe('Images 2026-10-23 14.05.pdf');
    expect(scanName(ms, tr)).toBe('Scan 2026-10-23 14.05.pdf');
  });
  it('uses the fallback for a blank custom name', () => {
    expect(customOutputName('  ', 'd.pdf')).toBe('d.pdf');
    expect(customOutputName(null, 'd.pdf')).toBe('d.pdf');
  });
  it('cleans a custom name', () => {
    expect(customOutputName('Receipt.PDF', 'd.pdf')).toBe('Receipt.pdf');
    expect(customOutputName('../x', 'd.pdf')).toBe('_x.pdf');
    expect(customOutputName('a/b:c?.pdf', 'd.pdf')).toBe('a_b_c_.pdf');
    expect(customOutputName('अ'.repeat(120), 'd.pdf')).toBe(`${'अ'.repeat(66)}.pdf`);
  });
});
