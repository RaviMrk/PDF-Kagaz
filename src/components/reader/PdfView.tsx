import {
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentType,
  type RefAttributes,
} from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import Pdf, { type PdfProps, type PdfRef } from 'react-native-pdf';

/** One outline (bookmark tree) entry; `page` is 1-based. */
export type OutlineItem = { title: string; page: number; children: OutlineItem[] };
export type PdfViewErrorKind = 'password' | 'invalid';
export type PdfViewHandle = { goToPage(page: number): void };
export type PdfViewProps = {
  fileUri: string;
  password: string;
  initialPage: number;
  horizontal: boolean;
  onLoad(info: { pageCount: number; outline: OutlineItem[] }): void;
  onPageChange(page: number, pageCount: number): void;
  onError(kind: PdfViewErrorKind): void;
  onTap(): void;
  testID?: string;
};

// The runtime accepts (PropTypes) and forwards `testID`; index.d.ts omits it.
const NativePdf = Pdf as ComponentType<PdfProps & { testID?: string } & RefAttributes<PdfRef>>;

const PASSWORD_MESSAGE = 'Password required or incorrect password';

/** Converts react-native-pdf's `TableContent[]` (0-based `pageIdx`) to `OutlineItem[]`. */
export function toOutline(contents: unknown): OutlineItem[] {
  if (!Array.isArray(contents)) return [];
  return contents.map((item: { title?: unknown; pageIdx?: unknown; children?: unknown }) => ({
    title: typeof item.title === 'string' ? item.title : '',
    page: (typeof item.pageIdx === 'number' ? item.pageIdx : 0) + 1,
    children: toOutline(item.children),
  }));
}

export function errorKindOf(error: unknown): PdfViewErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(PASSWORD_MESSAGE) ? 'password' : 'invalid';
}

function renderActivityIndicator() {
  return <ActivityIndicator size="large" />;
}

/**
 * The only importer of react-native-pdf. On Fabric every prop update reloads the whole document,
 * so the view re-renders only when the file, password or orientation changes; callbacks are read
 * from a ref and `initialPage` only applies to a (re)load — later jumps go through `goToPage`.
 */
const PdfViewInner = forwardRef<PdfViewHandle, PdfViewProps>(function PdfView(props, ref) {
  const { fileUri, password, initialPage, horizontal, testID } = props;
  if (!fileUri.startsWith('file://')) throw new Error('PdfView needs a file:// uri');

  const latest = useRef(props);
  latest.current = props;
  const pdf = useRef<PdfRef>(null);

  useImperativeHandle(ref, () => ({ goToPage: (page) => pdf.current?.setPage(page) }), []);

  const source = useMemo(() => ({ uri: fileUri }), [fileUri]);

  return (
    <NativePdf
      ref={pdf}
      testID={testID}
      source={source}
      page={initialPage}
      password={password}
      horizontal={horizontal}
      enablePaging={horizontal}
      scale={1}
      minScale={1}
      maxScale={4}
      fitPolicy={horizontal ? 2 : 0}
      spacing={horizontal ? 0 : 8}
      enableAntialiasing
      enableDoubleTapZoom
      style={styles.pdf}
      renderActivityIndicator={renderActivityIndicator}
      onLoadComplete={(pageCount, _path, _size, tableContents) =>
        latest.current.onLoad({ pageCount, outline: toOutline(tableContents) })
      }
      onPageChanged={(page, pageCount) => latest.current.onPageChange(page, pageCount)}
      onError={(error) => latest.current.onError(errorKindOf(error))}
      onPageSingleTap={() => latest.current.onTap()}
    />
  );
});

export const PdfView = memo(
  PdfViewInner,
  (a, b) => a.fileUri === b.fileUri && a.password === b.password && a.horizontal === b.horizontal,
);

const styles = StyleSheet.create({ pdf: { flex: 1 } });
