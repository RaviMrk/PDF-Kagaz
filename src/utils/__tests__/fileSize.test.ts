import { formatBytes } from '@/utils/fileSize';

test('formatBytes', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1023 B');
  expect(formatBytes(1024)).toBe('1.0 KB');
  expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
  expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
});

test('formatBytes steps up a unit at the rounding boundary', () => {
  expect(formatBytes(1048575)).toBe('1.0 MB');
  expect(formatBytes(1073741823)).toBe('1.0 GB');
});

test('formatBytes clamps negative and non-finite input', () => {
  expect(formatBytes(-5)).toBe('0 B');
  expect(formatBytes(NaN)).toBe('0 B');
  expect(formatBytes(Infinity)).toBe('0 B');
});
