/** @jest-environment node */
import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname, '../../app');

function filesUnder(target: string): string[] {
  const full = path.join(APP, target);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return [full];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(target, e.name);
    return e.isDirectory() ? filesUnder(rel) : [path.join(APP, rel)];
  });
}

describe('ad placement', () => {
  const adFree = [
    'reader',
    'tool',
    'scan.tsx',
    'onboarding.tsx',
    'licenses.tsx',
    '(tabs)/settings.tsx',
    '(tabs)/tools.tsx',
  ];

  it.each(adFree)('app/%s has no banner and no ads service', (target) => {
    for (const file of filesUnder(target)) {
      const src = fs.readFileSync(file, 'utf8');
      expect(`${file}: ${/AdBanner|services\/ads/.test(src)}`).toBe(`${file}: false`);
    }
  });

  it('app/ uses AdBanner only in Home and Files, and the ads service only in result', () => {
    const all = fs
      .readdirSync(APP, { recursive: true, encoding: 'utf8' })
      .map((f) => path.join(APP, f))
      .filter((f) => fs.statSync(f).isFile());
    const rel = (f: string) => path.relative(APP, f);
    const withBanner = all.filter((f) => /AdBanner/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(withBanner.sort()).toEqual([
      path.join('(tabs)', 'files.tsx'),
      path.join('(tabs)', 'home.tsx'),
    ]);
    const withAds = all.filter((f) => /services\/ads/.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(withAds).toEqual(['result.tsx']);
  });
});
