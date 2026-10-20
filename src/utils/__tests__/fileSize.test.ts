import { formatBytes } from '@/utils/fileSize';

test('formatBytes', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(1023)).toBe('1023 B');
  expect(formatBytes(1024)).toBe('1.0 KB');
  expect(formatBytes(10 * 1024 * 1024)).toBe('10.0 MB');
  expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
});
