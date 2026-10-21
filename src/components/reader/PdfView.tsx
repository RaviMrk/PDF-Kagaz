import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ComponentType,
  type RefAttributes,
  type RefObject,
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

type Callbacks = Pick<PdfViewProps, 'onLoad' | 'onPageChange' | 'onError' | 'onTap'>;
type NativeViewProps = Pick<
  PdfViewProps,
  'fileUri' | 'password' | 'initialPage' | 'horizontal' | 'testID'
> & {
  callbacks: RefObject<Callbacks>;
  pdf: RefObject<PdfRef | null>;
};

/**
 * Memoised on the file, password and orientation only: on Fabric every prop update of the native
 * view reloads the whole document. Callbacks are read from `callbacks.current` at call time.
 */
const NativeView = memo(
  function NativeView({
    fileUri,
    password,
    initialPage,
    horizontal,
    testID,
    callbacks,
    pdf,
  }: NativeViewProps) {
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
          callbacks.current.onLoad({ pageCount, outline: toOutline(tableContents) })
        }
        onPageChanged={(page, pageCount) => callbacks.current.onPageChange(page, pageCount)}
        onError={(error) => callbacks.current.onError(errorKindOf(error))}
        onPageSingleTap={() => callbacks.current.onTap()}
      />
    );
  },
  (a, b) => a.fileUri === b.fileUri && a.password === b.password && a.horizontal === b.horizontal,
);

/**
 * The only importer of react-native-pdf. The native view re-renders (and so reloads the document)
 * only when `fileUri`, `password` or `horizontal` changes; callbacks may change on every render and
 * the newest ones are always called.
 *
 * `initialPage` contract: it is read only when the document (re)loads — on mount and whenever
 * `password` or `horizontal` changes — and the view then opens at the `initialPage` of THAT render.
 * Callers must therefore always pass the live current page (not the page the reader opened at).
 * Later jumps go through `ref.goToPage(page)`.
 */
export const PdfView = forwardRef<PdfViewHandle, PdfViewProps>(function PdfView(props, ref) {
  const { fileUri, password, initialPage, horizontal, testID } = props;
  if (!fileUri.startsWith('file://')) throw new Error('PdfView needs a file:// uri');

  const callbacks = useRef<Callbacks>(props);
  useLayoutEffect(() => {
    callbacks.current = props;
  });
  const pdf = useRef<PdfRef>(null);
  useImperativeHandle(ref, () => ({ goToPage: (page) => pdf.current?.setPage(page) }), []);

  return (
    <NativeView
      fileUri={fileUri}
      password={password}
      initialPage={initialPage}
      horizontal={horizontal}
      testID={testID}
      callbacks={callbacks}
      pdf={pdf}
    />
  );
});

const styles = StyleSheet.create({ pdf: { flex: 1 } });
