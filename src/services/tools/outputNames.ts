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

export function compressedName(inputName: string, t: Translate): string {
  return build(t, 'output.compressed', inputName);
}

export function protectedName(inputName: string, t: Translate): string {
  return build(t, 'output.protected', inputName);
}

export function unlockedName(inputName: string, t: Translate): string {
  return build(t, 'output.unlocked', inputName);
}

export function watermarkedName(inputName: string, t: Translate): string {
  return build(t, 'output.watermarked', inputName);
}

export function numberedName(inputName: string, t: Translate): string {
  return build(t, 'output.numbered', inputName);
}

export function signedName(inputName: string, t: Translate): string {
  return build(t, 'output.signed', inputName);
}

/** PDF to images: the gallery folder for one input's pages. */
export function imageFolderName(inputName: string, t: Translate): string {
  return t('output.imageFolder', { name: outputBaseName(inputName) });
}

/** PDF to images: one page's file, its number zero-padded to the width of the page count. */
export function imageFileName(
  inputName: string,
  page: number,
  pageCount: number,
  format: 'jpg' | 'png',
  t: Translate,
): string {
  const padded = String(page).padStart(String(pageCount).length, '0');
  return `${t('output.imageFile', { name: outputBaseName(inputName), page: padded })}.${format}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local `YYYY-MM-DD HH.mm` with ASCII digits (no colon: not valid in file names). */
export function nameStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}.${pad2(d.getMinutes())}`;
}

export function imagesName(ms: number, t: Translate): string {
  return `${t('output.images', { date: nameStamp(ms) })}.pdf`;
}

export function scanName(ms: number, t: Translate): string {
  return `${t('output.scan', { date: nameStamp(ms) })}.pdf`;
}

/** The user's typed name, cleaned; the default name when the field is blank. */
export function customOutputName(text: string | null, fallback: string): string {
  if (text === null || text.trim() === '') return fallback;
  return `${outputBaseName(text)}.pdf`;
}
