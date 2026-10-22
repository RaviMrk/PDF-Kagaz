import { checkInputSizes } from '../limits';

describe('checkInputSizes', () => {
  it('flags the first file over the cap', () => {
    expect(checkInputSizes([1, 31_457_281])).toEqual({ ok: false, reason: 'tooLarge', index: 1 });
  });
  it('accepts a file exactly at the cap', () => {
    expect(checkInputSizes([31_457_280])).toEqual({ ok: true });
  });
  it('flags a total over the cap', () => {
    expect(checkInputSizes([30e6, 30e6, 30e6, 30e6])).toEqual({
      ok: false,
      reason: 'totalTooLarge',
    });
  });
});
