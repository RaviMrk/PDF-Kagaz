import { formatPageRanges } from '@/utils/pageRanges';
import { outputBaseName } from '@/utils/fileName';

export type Translate = (key: string, options?: Record<string, unknown>) => string;
export type SplitMode = 'ranges' | 'everyN' | 'extract';

function build(t: Translate, key: string, inputName: string, extra: Record<string, unknown> = {}) {
  return `${t(key, { name: outputBaseName(inputName), ...extra })}.pdf`;
}

export function mergedName(firstInputName: string, t: Translate): string {
  return build(t, 'output.merged', firstInputName);
}

export function splitNames(
  inputName: string,
  mode: SplitMode,
  groups: number[][],
  t: Translate,
): string[] {
  if (mode === 'extract') return [build(t, 'output.extracted', inputName)];
  if (mode === 'everyN')
    return groups.map((_, i) => build(t, 'output.part', inputName, { n: i + 1 }));
  return groups.map((g) =>
    g.length === 1
      ? build(t, 'output.page', inputName, { page: g[0] })
      : build(t, 'output.pages', inputName, { range: formatPageRanges(g) }),
  );
}

export function organisedName(inputName: string, t: Translate): string {
  return build(t, 'output.organised', inputName);
}
