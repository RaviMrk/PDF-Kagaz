const UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

/** Human-readable size using base 1024, e.g. 1536 -> "1.5 KB". Invalid input -> "0 B". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  // Compare the rounded value so 1023.96 KB becomes "1.0 MB", not "1024.0 KB".
  while (Number(value.toFixed(1)) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}
