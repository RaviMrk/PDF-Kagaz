import { validateNewPassword } from '../newPassword';

describe('validateNewPassword', () => {
  it('needs at least 4 characters', () => {
    expect(validateNewPassword('abc', 'abc')).toBe('tooShort');
  });
  it('accepts matching passwords of 4 characters', () => {
    expect(validateNewPassword('abcd', 'abcd')).toBeNull();
  });
  it('rejects a confirmation that differs', () => {
    expect(validateNewPassword('abcd', 'abce')).toBe('mismatch');
  });
  it('rejects more than 127 UTF-8 bytes', () => {
    const long = 'अ'.repeat(43);
    expect(validateNewPassword(long, long)).toBe('tooLong');
    expect(validateNewPassword('अ'.repeat(42), 'अ'.repeat(42))).toBeNull();
  });
  it('counts code points, not UTF-16 units', () => {
    expect(validateNewPassword('🔒🔒🔒🔒', '🔒🔒🔒🔒')).toBeNull();
    expect(validateNewPassword('🔒🔒🔒', '🔒🔒🔒')).toBe('tooShort');
  });
  it('checks length before the match', () => {
    expect(validateNewPassword('abc', 'xyz')).toBe('tooShort');
  });
});
