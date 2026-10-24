import { degrees, type PDFImage, type PDFPage, rgb, StandardFonts } from '@cantoo/pdf-lib';

import type { StampPosition } from '../tools/runTool';
import { loadPdf } from './loadPdf';
import { throwIfCancelled, type RunControl } from './pdfErrors';
import {
  normalizeRotation,
  type PageBox,
  placeOnPage,
  positionCenter,
  rotatedBounds,
  visualSize,
} from './stampGeometry';

/** At a named position `marginPt` inside the edges, or centred at fractions of the page as seen. */
export type StampAnchor =
  { position: StampPosition; marginPt: number } | { cx: number; cy: number };
/** `widthFrac` of the seen page width; `angle` counter-clockwise as seen; `pages` 1-based, null = all. */
export type ImageStamp = {
  kind: 'image';
  png: string;
  pages: number[] | null;
  anchor: StampAnchor;
  widthFrac: number;
  angle: number;
  opacity: number;
};
/** Helvetica, black; `{n}` / `{total}` in `template`. */
export type TextStamp = {
  kind: 'text';
  template: string;
  start: number;
  pages: number[] | null;
  position: StampPosition;
  fontSize: number;
  marginPt: number;
};
export type StampSpec = { stamps: (ImageStamp | TextStamp)[] };

/** Used when a template cannot be written in Helvetica (WinAnsi). */
export const FALLBACK_TEMPLATE = '{n} / {total}';

export function labelFor(template: string, n: number, total: number): string {
  return template.replaceAll('{n}', String(n)).replaceAll('{total}', String(total));
}

// The cp1252 characters of WinAnsiEncoding outside Latin-1.
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/**
 * True when every character of `text` is in WinAnsiEncoding (Helvetica can show it). No-break space
 * and soft hyphen are refused: the two engines encode them differently.
 */
export function isWinAnsi(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const ok =
      (c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff && c !== 0xad) || CP1252_EXTRAS.has(c);
    if (!ok) return false;
  }
  return true;
}

/** 1-based pages of `pages` that exist (sorted, once each); null = every page. */
export function stampedPages(pages: number[] | null, pageCount: number): number[] {
  if (pages === null) return Array.from({ length: pageCount }, (_, i) => i + 1);
  return [...new Set(pages)]
    .filter((p) => Number.isInteger(p) && p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
}

function pageBoxOf(page: PDFPage): PageBox {
  const crop = page.getCropBox();
  return {
    x: Math.min(crop.x, crop.x + crop.width),
    y: Math.min(crop.y, crop.y + crop.height),
    width: Math.abs(crop.width),
    height: Math.abs(crop.height),
    rotation: normalizeRotation(page.getRotation().angle),
  };
}

/**
 * Draws `spec` onto a copy of `bytes` (strict load; encrypted → PdfToolError('encrypted')).
 * Each PNG is read and embedded once. Page numbers count over the stamped pages only:
 * n = start + index, total = start + count − 1. Cancel is checked before every page and progress
 * reported after it.
 */
export async function applyStamps(
  bytes: Uint8Array,
  spec: StampSpec,
  readPng: (uri: string) => Promise<Uint8Array>,
  control: RunControl = {},
): Promise<Uint8Array> {
  const { onProgress, signal } = control;
  throwIfCancelled(signal);
  const doc = await loadPdf(bytes);
  const pages = doc.getPages();
  const plans = spec.stamps.map((stamp) => ({
    stamp,
    pages: stampedPages(stamp.pages, pages.length),
  }));
  const units = plans.reduce((sum, p) => sum + p.pages.length, 0);
  const images = new Map<string, PDFImage>();
  const font = plans.some((p) => p.stamp.kind === 'text')
    ? await doc.embedFont(StandardFonts.Helvetica)
    : null;
  let done = 0;
  for (const plan of plans) {
    const { stamp } = plan;
    let image: PDFImage | undefined;
    if (stamp.kind === 'image' && plan.pages.length > 0) {
      image = images.get(stamp.png);
      if (!image) {
        image = await doc.embedPng(await readPng(stamp.png));
        images.set(stamp.png, image);
      }
    }
    const template =
      stamp.kind === 'text' && !isWinAnsi(stamp.template)
        ? FALLBACK_TEMPLATE
        : stamp.kind === 'text'
          ? stamp.template
          : '';
    for (const [index, number] of plan.pages.entries()) {
      throwIfCancelled(signal);
      const page = pages[number - 1];
      if (!page) continue;
      const box = pageBoxOf(page);
      const seen = visualSize(box);
      if (stamp.kind === 'image' && image) {
        const width = stamp.widthFrac * seen.width;
        const size = { width, height: (width * image.height) / image.width };
        const center =
          'position' in stamp.anchor
            ? positionCenter(
                stamp.anchor.position,
                seen,
                rotatedBounds(size.width, size.height, stamp.angle),
                stamp.anchor.marginPt,
              )
            : { cx: stamp.anchor.cx * seen.width, cy: stamp.anchor.cy * seen.height };
        const at = placeOnPage(box, center, size, stamp.angle);
        page.drawImage(image, {
          x: at.x,
          y: at.y,
          width: at.width,
          height: at.height,
          rotate: degrees(at.rotate),
          opacity: Math.min(1, Math.max(0, stamp.opacity)),
        });
      } else if (stamp.kind === 'text' && font) {
        const label = labelFor(template, stamp.start + index, stamp.start + plan.pages.length - 1);
        const size = {
          width: font.widthOfTextAtSize(label, stamp.fontSize),
          height: stamp.fontSize,
        };
        const center = positionCenter(stamp.position, seen, size, stamp.marginPt);
        const at = placeOnPage(box, center, size, 0);
        page.drawText(label, {
          x: at.x,
          y: at.y,
          size: stamp.fontSize,
          font,
          color: rgb(0, 0, 0),
          rotate: degrees(at.rotate),
        });
      }
      done += 1;
      onProgress?.(units === 0 ? 1 : (done / units) * 0.9);
    }
  }
  throwIfCancelled(signal);
  const result = await doc.save({ useObjectStreams: true });
  onProgress?.(1);
  return result;
}
