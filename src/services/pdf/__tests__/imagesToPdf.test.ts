/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';

import { inspectImages, inspectPages, loadStrict, readFixture } from '@/test-utils/pdfFixtures';

import { DEFAULT_IMAGES_LAYOUT, type ImageLayoutOptions } from '../imageLayout';
import { imagesToPdf } from '../imagesToPdf';
import { PdfToolError } from '../pdfErrors';

const img = (name: string) => () => Promise.resolve(readFixture(`images/${name}`));
const landscape = img('landscape-400x300.jpg');
const portrait = img('portrait-300x400.jpg');
const notImage = img('not-an-image.jpg');

async function failure(promise: Promise<unknown>): Promise<PdfToolError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(PdfToolError);
    return e as PdfToolError;
  }
  throw new Error('expected rejection');
}

describe('imagesToPdf', () => {
  it('places each image on a page sized by the layout', async () => {
    const out = await imagesToPdf([landscape, portrait], DEFAULT_IMAGES_LAYOUT);
    const pages = await inspectPages(out);
    expect(pages.map((p) => p.size)).toEqual([
      [842, 595],
      [595, 842],
    ]);
  });

  it('embeds the JPEG bytes without re-encoding', async () => {
    const out = await imagesToPdf([landscape, portrait], DEFAULT_IMAGES_LAYOUT);
    const images = await inspectImages(out);
    expect(images[0]?.images).toEqual([{ width: 400, height: 300, filter: 'DCTDecode' }]);
    expect(images[1]?.images).toEqual([{ width: 300, height: 400, filter: 'DCTDecode' }]);
  });

  it('sizes fit pages from the image', async () => {
    const layout: ImageLayoutOptions = { pageSize: 'fit', orientation: 'auto', margin: 'none' };
    const out = await imagesToPdf([portrait], layout);
    expect((await inspectPages(out))[0]?.size).toEqual([632, 842]);
  });

  it('handles 100 images', async () => {
    const out = await imagesToPdf(
      Array.from({ length: 100 }, () => landscape),
      DEFAULT_IMAGES_LAYOUT,
    );
    expect(await inspectPages(out)).toHaveLength(100);
  });

  it('refuses an empty list', async () => {
    expect((await failure(imagesToPdf([], DEFAULT_IMAGES_LAYOUT))).kind).toBe('empty');
  });

  it('reports an undecodable image with its index', async () => {
    const e = await failure(imagesToPdf([landscape, notImage], DEFAULT_IMAGES_LAYOUT));
    expect(e.kind).toBe('invalid');
    expect(e.inputIndex).toBe(1);
  });

  it('reports a failing loader with its index', async () => {
    const bad = () => Promise.reject(new Error('read failed'));
    const e = await failure(imagesToPdf([landscape, landscape, bad], DEFAULT_IMAGES_LAYOUT));
    expect(e.kind).toBe('invalid');
    expect(e.inputIndex).toBe(2);
  });

  it('cancels when aborted during a load', async () => {
    const controller = new AbortController();
    const loader = () => {
      controller.abort();
      return Promise.resolve(readFixture('images/landscape-400x300.jpg'));
    };
    const e = await failure(
      imagesToPdf([loader, landscape], DEFAULT_IMAGES_LAYOUT, { signal: controller.signal }),
    );
    expect(e.kind).toBe('cancelled');
  });

  it('reports a loader failing after an abort as cancelled, not as a damaged image', async () => {
    const controller = new AbortController();
    const loader = () => {
      controller.abort();
      return Promise.reject(new Error('read interrupted'));
    };
    const e = await failure(
      imagesToPdf([landscape, loader], DEFAULT_IMAGES_LAYOUT, { signal: controller.signal }),
    );
    expect(e.kind).toBe('cancelled');
    expect(e.inputIndex).toBeNull();
  });

  it('passes a cancellation thrown by a loader through unchanged', async () => {
    const loader = () => Promise.reject(new PdfToolError('cancelled'));
    const e = await failure(imagesToPdf([loader], DEFAULT_IMAGES_LAYOUT));
    expect(e.kind).toBe('cancelled');
  });

  it('reports strictly increasing progress ending at 1', async () => {
    const seen: number[] = [];
    await imagesToPdf([landscape, portrait, landscape], DEFAULT_IMAGES_LAYOUT, {
      onProgress: (f) => seen.push(f),
    });
    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('sets the producer and creator but no title', async () => {
    const doc = await loadStrict(await imagesToPdf([landscape], DEFAULT_IMAGES_LAYOUT));
    expect(doc.getProducer()).toBe('PDF Toolkit');
    expect(doc.getCreator()).toBe('PDF Toolkit');
    expect(doc.getTitle()).toBeUndefined();
  });

  it('leaves the fixture bytes unchanged', async () => {
    const file = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '__fixtures__',
      'images',
      'landscape-400x300.jpg',
    );
    const before = fs.readFileSync(file);
    await imagesToPdf([landscape], DEFAULT_IMAGES_LAYOUT);
    expect(Buffer.compare(before, fs.readFileSync(file))).toBe(0);
  });
});
