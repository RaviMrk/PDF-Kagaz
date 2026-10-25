import { Directory, File, Paths } from 'expo-file-system';

/** Byte I/O for tool workspace files (file:// URIs inside the private workspace only). */
export type ToolFs = {
  readBytes(fileUri: string): Promise<Uint8Array>;
  writeBytes(fileUri: string, bytes: Uint8Array): Promise<void>;
};

export const expoToolFs: ToolFs = {
  readBytes: (fileUri) => new File(fileUri).bytes(),
  async writeBytes(fileUri, bytes) {
    const f = new File(fileUri);
    f.create({ overwrite: true });
    f.write(bytes);
  },
};

/**
 * file:// URI of the saved signatures folder: filesDir/signatures, where the native pad writes
 * `sig-*.png` (expo-file-system's document directory is the app's filesDir on Android).
 */
export function signaturesDirUri(): string {
  return new Directory(Paths.document, 'signatures').uri.replace(/\/+$/, '');
}
