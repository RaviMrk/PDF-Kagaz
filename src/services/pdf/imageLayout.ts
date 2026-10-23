import { PdfToolError } from './pdfErrors';

export type PageSizeOption = 'a4' | 'letter' | 'fit';
export type OrientationOption = 'auto' | 'portrait' | 'landscape';
export type MarginOption = 'none' | 'small' | 'large';
export type ImageLayoutOptions = {
  pageSize: PageSizeOption;
  orientation: OrientationOption;
  margin: MarginOption;
};

/** Portrait page sizes in PDF points. */
export const PAGE_SIZES_PT = { a4: [595, 842], letter: [612, 792] } as const;
export const MARGINS_PT = { none: 0, small: 18, large: 36 } as const;
/** "Fit" scales the image so its long side is A4's long side, whatever the camera resolution. */
export const FIT_LONG_SIDE_PT = 842;

export type Placement = {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_IMAGES_LAYOUT: ImageLayoutOptions = {
  pageSize: 'a4',
  orientation: 'auto',
  margin: 'small',
};
export const DEFAULT_SCAN_LAYOUT: ImageLayoutOptions = {
  pageSize: 'fit',
  orientation: 'auto',
  margin: 'none',
};

/** Page box and image rectangle (origin bottom-left) for one image. */
export function placeImage(
  imageWidth: number,
  imageHeight: number,
  layout: ImageLayoutOptions,
): Placement {
  if (!(imageWidth > 0) || !(imageHeight > 0) || !Number.isFinite(imageWidth + imageHeight)) {
    throw new PdfToolError('invalid');
  }
  const margin = MARGINS_PT[layout.margin];

  if (layout.pageSize === 'fit') {
    const scale = FIT_LONG_SIDE_PT / Math.max(imageWidth, imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      pageWidth: width + 2 * margin,
      pageHeight: height + 2 * margin,
      x: margin,
      y: margin,
      width,
      height,
    };
  }

  const [portraitW, portraitH] = PAGE_SIZES_PT[layout.pageSize];
  const landscape =
    layout.orientation === 'landscape' ||
    (layout.orientation === 'auto' && imageWidth > imageHeight);
  const pageWidth = landscape ? portraitH : portraitW;
  const pageHeight = landscape ? portraitW : portraitH;
  const boxWidth = pageWidth - 2 * margin;
  const boxHeight = pageHeight - 2 * margin;
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    pageWidth,
    pageHeight,
    x: margin + (boxWidth - width) / 2,
    y: margin + (boxHeight - height) / 2,
    width,
    height,
  };
}

const PAGE_SIZES: readonly unknown[] = ['a4', 'letter', 'fit'];
const ORIENTATIONS: readonly unknown[] = ['auto', 'portrait', 'landscape'];
const MARGINS: readonly unknown[] = ['none', 'small', 'large'];

export function isImageLayout(v: unknown): v is ImageLayoutOptions {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    PAGE_SIZES.includes(o.pageSize) &&
    ORIENTATIONS.includes(o.orientation) &&
    MARGINS.includes(o.margin)
  );
}
