const { withAndroidManifest } = require('expo/config-plugins');

const PDF = 'application/pdf';

/**
 * expo-dev-client appends its `exp+<slug>` scheme to every VIEW intent filter. A filter with a
 * scheme only matches URIs of that scheme, so the PDF "Open with" filter would no longer match
 * content:// and file:// documents. PDF filters keep only their mimeType data.
 */
function stripSchemesFromPdfFilters(manifest) {
  for (const application of manifest.manifest.application ?? []) {
    for (const activity of application.activity ?? []) {
      for (const filter of activity['intent-filter'] ?? []) {
        const data = filter.data ?? [];
        if (!data.some((d) => d.$?.['android:mimeType'] === PDF)) continue;
        filter.data = data.filter((d) => d.$?.['android:scheme'] === undefined);
      }
    }
  }
  return manifest;
}

const withPdfIntentFilters = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = stripSchemesFromPdfFilters(cfg.modResults);
    return cfg;
  });

module.exports = withPdfIntentFilters;
module.exports.default = withPdfIntentFilters;
module.exports.stripSchemesFromPdfFilters = stripSchemesFromPdfFilters;
