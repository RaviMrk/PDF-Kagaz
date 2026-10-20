import { formatDate } from '../date';

describe('formatDate', () => {
  it('formats day, short month and year', () => {
    const s = formatDate(Date.UTC(2026, 9, 20, 12), 'en-GB');
    expect(s).toContain('20');
    expect(s).toContain('Oct');
    expect(s).toContain('2026');
  });
});
