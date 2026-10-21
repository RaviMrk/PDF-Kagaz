import { NIGHT_FILTER, SEPIA_FILTER, readerBackground, readerFilter } from '../readerFilters';

describe('readerFilters', () => {
  it('maps themes to filters', () => {
    expect(readerFilter('normal')).toBeUndefined();
    expect(readerFilter('night')).toEqual(NIGHT_FILTER);
    expect(readerFilter('sepia')).toEqual(SEPIA_FILTER);
  });
  it('maps themes to backgrounds', () => {
    expect(readerBackground('normal')).toBe('#E8E8E8');
    expect(readerBackground('night')).toBe('#000000');
    expect(readerBackground('sepia')).toBe('#F1E7D0');
  });
});
