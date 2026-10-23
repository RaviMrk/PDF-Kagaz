/** @jest-environment node */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join('/');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'test-utils' ? [] : walk(full);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [full] : [];
  });
}

const sources = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))];
const read = (f: string) => fs.readFileSync(f, 'utf8');
const importing = (re: RegExp) => sources.filter((f) => re.test(read(f))).map(rel);

describe('ad placement', () => {
  it('imports AdBanner only from Home and Files', () => {
    expect(importing(/['"][^'"]*\/AdBanner['"]/).sort()).toEqual([
      'app/(tabs)/files.tsx',
      'app/(tabs)/home.tsx',
    ]);
  });

  it('imports the interstitial only from the result screen and the ads lifecycle', () => {
    expect(importing(/['"][^'"]*ads\/interstitial['"]/).sort()).toEqual([
      'app/result.tsx',
      'src/components/AdsLifecycle.tsx',
    ]);
  });

  it('imports the ads package only from the ads service and AdBanner', () => {
    const allowed = (f: string) =>
      f.startsWith('src/services/ads/') || f === 'src/components/AdBanner.tsx';
    expect(importing(/react-native-google-mobile-ads/).filter((f) => !allowed(f))).toEqual([]);
  });

  describe('settings components', () => {
    const dir = path.join(ROOT, 'src/components/settings');
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));

    it.each(files)('%s never touches banners, the interstitial or the ads package', (f) => {
      expect(
        /AdBanner|ads\/interstitial|react-native-google-mobile-ads/.test(read(path.join(dir, f))),
      ).toBe(false);
    });

    it('lets only AdPrivacyRow reach the ads service, and only for useAds', () => {
      const using = files.filter((f) => /services\/ads/.test(read(path.join(dir, f))));
      expect(using).toEqual(['AdPrivacyRow.tsx']);
      const imports = read(path.join(dir, 'AdPrivacyRow.tsx')).match(
        /from '@\/services\/ads\/[^']+'/g,
      );
      expect(imports).toEqual(["from '@/services/ads/adsStore'"]);
      expect(read(path.join(dir, 'AdPrivacyRow.tsx'))).toMatch(/import \{ useAds \} from/);
    });
  });

  describe('ad-free screens', () => {
    const adFree = [
      'app/reader/[id].tsx',
      'app/tool/[toolId].tsx',
      'app/tool/organize/[id].tsx',
      'app/scan.tsx',
      'app/signature.tsx',
      'app/open.tsx',
      'app/onboarding.tsx',
      'app/(tabs)/settings.tsx',
      'app/(tabs)/tools.tsx',
    ];
    const futureRoutes = ['app/licenses.tsx'];

    it.each(adFree)('%s exists and does not touch ads', (target) => {
      const full = path.join(ROOT, target);
      expect(fs.existsSync(full)).toBe(true);
      expect(/AdBanner|services\/ads/.test(read(full))).toBe(false);
    });

    it.each(futureRoutes)('%s (when it exists) does not touch ads', (target) => {
      const full = path.join(ROOT, target);
      if (fs.existsSync(full)) expect(/AdBanner|services\/ads/.test(read(full))).toBe(false);
    });

    it('lists every route file under app/ as ad-free, Home/Files/result or a layout', () => {
      const known = new Set([
        ...adFree,
        ...futureRoutes,
        'app/(tabs)/home.tsx',
        'app/(tabs)/files.tsx',
        'app/result.tsx',
        'app/(tabs)/_layout.tsx',
        'app/_layout.tsx',
        'app/index.tsx',
        'app/+native-intent.tsx',
      ]);
      expect(
        walk(path.join(ROOT, 'app'))
          .map(rel)
          .filter((f) => !known.has(f)),
      ).toEqual([]);
    });
  });
});
