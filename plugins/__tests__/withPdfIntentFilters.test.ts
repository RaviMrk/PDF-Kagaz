// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripSchemesFromPdfFilters } = require('../withPdfIntentFilters');

type Item = { $: Record<string, string> };
type Filter = { action: Item[]; category?: Item[]; data?: Item[] };

const named = (name: string): Item => ({ $: { 'android:name': name } });

function manifestWith(filters: Filter[]) {
  return {
    manifest: {
      $: {},
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          activity: [
            {
              $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' },
              'intent-filter': filters,
            },
          ],
        },
      ],
    },
  };
}

describe('stripSchemesFromPdfFilters', () => {
  it('removes the dev-client scheme from the PDF VIEW filter and keeps the app-link filter', () => {
    const schemeFilter: Filter = {
      action: [named('android.intent.action.VIEW')],
      data: [
        { $: { 'android:scheme': 'pdftoolkit' } },
        { $: { 'android:scheme': 'exp+pdf-toolkit' } },
      ],
    };
    const pdfFilter: Filter = {
      action: [named('android.intent.action.VIEW')],
      category: [named('android.intent.category.DEFAULT')],
      data: [
        { $: { 'android:mimeType': 'application/pdf' } },
        { $: { 'android:scheme': 'exp+pdf-toolkit' } },
      ],
    };
    const m = stripSchemesFromPdfFilters(manifestWith([schemeFilter, pdfFilter]));
    const [links, pdf] = m.manifest.application[0].activity[0]['intent-filter'];
    expect(pdf.data).toEqual([{ $: { 'android:mimeType': 'application/pdf' } }]);
    expect(links.data).toHaveLength(2);
  });
});
