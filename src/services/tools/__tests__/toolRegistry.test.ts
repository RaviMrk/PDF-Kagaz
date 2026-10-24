import en from '@/i18n/en.json';

import { TOOL_ENGINE } from '../limits';
import { QUICK_TOOL_IDS, TOOLS, toolById, toolsByGroup } from '../toolRegistry';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en);
}

describe('toolRegistry', () => {
  it('has 14 unique tools covering T-01..T-14', () => {
    expect(TOOLS).toHaveLength(14);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(14);
    const specs = TOOLS.map((t) => t.specId);
    for (let i = 1; i <= 14; i++) expect(specs).toContain(`T-${String(i).padStart(2, '0')}`);
  });
  it('groups in order', () => {
    const groups = toolsByGroup();
    expect(groups.map((g) => g.group)).toEqual([
      'organise',
      'convert',
      'optimise',
      'security',
      'edit',
    ]);
    expect(groups[0]?.tools.map((t) => t.id)).toEqual(['merge', 'split', 'organize']);
    expect(groups[1]?.tools.map((t) => t.id)).toEqual([
      'images-to-pdf',
      'scan',
      'pdf-to-images',
      'ocr',
    ]);
  });
  it('every tool but sign, OCR and metadata is available', () => {
    expect(TOOLS.filter((t) => t.available).map((t) => t.id)).toEqual([
      'merge',
      'split',
      'organize',
      'images-to-pdf',
      'scan',
      'compress',
      'protect',
      'unlock',
      'pdf-to-images',
      'watermark',
      'page-numbers',
    ]);
  });
  it('looks tools up by id', () => {
    expect(toolById('merge')).toMatchObject({ minInputs: 2, maxInputs: 50 });
    expect(toolById('split')).toMatchObject({ minInputs: 1, maxInputs: 1 });
    expect(toolById('images-to-pdf')).toMatchObject({ minInputs: 1, maxInputs: 100 });
    expect(toolById('images-to-pdf')!.maxInputs).toBe(100);
    expect(toolById('nope')).toBeNull();
  });
  it('routes scan to /scan and others to the tool screen', () => {
    expect(toolById('scan')?.href).toBe('/scan');
    expect(toolById('images-to-pdf')?.href).toEqual({
      pathname: '/tool/[toolId]',
      params: { toolId: 'images-to-pdf' },
    });
  });
  it('has en.json strings for every label and description', () => {
    for (const t of TOOLS) {
      expect(typeof lookup(t.labelKey)).toBe('string');
      expect(typeof lookup(t.descriptionKey)).toBe('string');
    }
    expect(toolById('images-to-pdf')?.labelKey).toBe('tools.imagesToPdf');
    expect(toolById('page-numbers')?.descriptionKey).toBe('tools.desc.pageNumbers');
  });
  it('gives every runnable tool an engine; the v1.1 tools stay unavailable', () => {
    expect(Object.keys(TOOL_ENGINE).sort()).toEqual(
      [
        'merge',
        'split',
        'organize',
        'images-to-pdf',
        'scan',
        'compress',
        'protect',
        'unlock',
        'pdf-to-images',
        'watermark',
        'page-numbers',
        'sign',
      ].sort(),
    );
    for (const id of Object.keys(TOOL_ENGINE)) expect(toolById(id)).not.toBeNull();
  });
  it('has quick tools', () => {
    expect(QUICK_TOOL_IDS).toEqual(['scan', 'merge', 'compress', 'images-to-pdf']);
  });
});
