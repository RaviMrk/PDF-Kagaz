import type { OutlineItem } from '@/components/reader/PdfView';

export type OutlineRow = { key: string; title: string; page: number; depth: number };

export function flattenOutline(items: OutlineItem[], maxDepth = 6): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (list: OutlineItem[], prefix: string, depth: number) => {
    list.forEach((item, i) => {
      const key = prefix === '' ? `${i}` : `${prefix}.${i}`;
      rows.push({ key, title: item.title, page: item.page, depth: Math.min(depth, maxDepth) });
      walk(item.children, key, depth + 1);
    });
  };
  walk(items, '', 0);
  return rows;
}
