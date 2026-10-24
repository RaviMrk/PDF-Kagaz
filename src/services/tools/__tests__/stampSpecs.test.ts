import {
  pageNumberSpec,
  signatureSpec,
  WATERMARK_COLORS,
  WATERMARK_SIZES,
  watermarkSpec,
} from '../stampSpecs';

describe('stamp specs', () => {
  it('pins the watermark sizes and colours', () => {
    expect(WATERMARK_SIZES).toEqual({ small: 0.3, medium: 0.5, large: 0.8 });
    expect(WATERMARK_COLORS).toEqual({ grey: 0xff808080, red: 0xffd32f2f, blue: 0xff1565c0 });
  });

  it('builds a watermark as one image stamp with a 24 pt margin', () => {
    expect(
      watermarkSpec(
        {
          source: { kind: 'text', text: 'DRAFT', color: 'grey' },
          size: 'large',
          position: 'top-right',
          opacity: 0.5,
          angle: -45,
          pages: null,
        },
        'file:///w.png',
      ),
    ).toEqual({
      stamps: [
        {
          kind: 'image',
          png: 'file:///w.png',
          pages: null,
          anchor: { position: 'top-right', marginPt: 24 },
          widthFrac: 0.8,
          angle: -45,
          opacity: 0.5,
        },
      ],
    });
  });

  it('keeps the chosen watermark pages', () => {
    const spec = watermarkSpec(
      {
        source: { kind: 'image', sessionId: 'img-a', index: 0 },
        size: 'small',
        position: 'center',
        opacity: 0.2,
        angle: 0,
        pages: [2, 4],
      },
      'file:///i.png',
    );
    expect(spec.stamps[0]).toMatchObject({ pages: [2, 4], widthFrac: 0.3, angle: 0 });
  });

  it('numbers pages with the template passed in for "page n of total"', () => {
    expect(
      pageNumberSpec(
        { position: 'bottom-center', format: 'pageOfTotal', start: 3, fontSize: 14, pages: [1, 2] },
        'Page {n} of {total}',
      ),
    ).toEqual({
      stamps: [
        {
          kind: 'text',
          template: 'Page {n} of {total}',
          start: 3,
          pages: [1, 2],
          position: 'bottom-center',
          fontSize: 14,
          marginPt: 28,
        },
      ],
    });
  });

  it('numbers pages with the bare number for format "n"', () => {
    const spec = pageNumberSpec(
      { position: 'top-left', format: 'n', start: 1, fontSize: 10, pages: null },
      'Page {n} of {total}',
    );
    expect(spec.stamps[0]).toMatchObject({ kind: 'text', template: '{n}', marginPt: 28 });
  });

  it('places one opaque, upright image stamp per signature placement', () => {
    const pngOf = (id: number) => `file:///work/sig-${id}.png`;
    expect(
      signatureSpec(
        [
          { signatureId: 7, page: 2, cx: 0.5, cy: 0.8, width: 0.3 },
          { signatureId: 9, page: 5, cx: 0.25, cy: 0.1, width: 0.2 },
        ],
        pngOf,
      ),
    ).toEqual({
      stamps: [
        {
          kind: 'image',
          png: 'file:///work/sig-7.png',
          pages: [2],
          anchor: { cx: 0.5, cy: 0.8 },
          widthFrac: 0.3,
          angle: 0,
          opacity: 1,
        },
        {
          kind: 'image',
          png: 'file:///work/sig-9.png',
          pages: [5],
          anchor: { cx: 0.25, cy: 0.1 },
          widthFrac: 0.2,
          angle: 0,
          opacity: 1,
        },
      ],
    });
  });
});
