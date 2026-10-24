import type { StampSpec } from '../pdf/stamp';
import type { PageNumberOptions, SignaturePlacement, WatermarkOptions } from './runTool';

/** Watermark width as a fraction of the page width as seen. */
export const WATERMARK_SIZES = { small: 0.3, medium: 0.5, large: 0.8 } as const;
/** Text watermark colours, ARGB. */
export const WATERMARK_COLORS = { grey: 0xff808080, red: 0xffd32f2f, blue: 0xff1565c0 } as const;

const WATERMARK_MARGIN_PT = 24;
const PAGE_NUMBER_MARGIN_PT = 28;

/** A watermark (text already rendered to `pngUri`, or a prepared image) as one image stamp. */
export function watermarkSpec(opts: WatermarkOptions, pngUri: string): StampSpec {
  return {
    stamps: [
      {
        kind: 'image',
        png: pngUri,
        pages: opts.pages,
        anchor: { position: opts.position, marginPt: WATERMARK_MARGIN_PT },
        widthFrac: WATERMARK_SIZES[opts.size],
        angle: opts.angle,
        opacity: opts.opacity,
      },
    ],
  };
}

/** Page numbers; `template` is the localised "page n of total" text, used for that format. */
export function pageNumberSpec(opts: PageNumberOptions, template: string): StampSpec {
  return {
    stamps: [
      {
        kind: 'text',
        template: opts.format === 'pageOfTotal' ? template : '{n}',
        start: opts.start,
        pages: opts.pages,
        position: opts.position,
        fontSize: opts.fontSize,
        marginPt: PAGE_NUMBER_MARGIN_PT,
      },
    ],
  };
}

/** One opaque, upright image stamp per placement; `pngOf` gives the signature's workspace PNG. */
export function signatureSpec(
  placements: SignaturePlacement[],
  pngOf: (id: number) => string,
): StampSpec {
  return {
    stamps: placements.map((p) => ({
      kind: 'image' as const,
      png: pngOf(p.signatureId),
      pages: [p.page],
      anchor: { cx: p.cx, cy: p.cy },
      widthFrac: p.width,
      angle: 0,
      opacity: 1,
    })),
  };
}
