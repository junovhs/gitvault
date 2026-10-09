import { safeRelative, canonicalPath } from './locator.js';

export const MAX_FOLDER_FILES = 128;
export const MAX_FOLDER_BYTES = 8 * 1024 * 1024;
export const MAX_FOLDER_CONTAINER = 12 * 1024 * 1024;
export type FolderFile = { path: string; bytes: Uint8Array };
type EncodedFolder = { format: 'gitvault-folder'; version: 1; files: Array<{ path: string; data: string }> };

function validatePaths(paths: string[]): void {
  if (!paths.length || paths.length > MAX_FOLDER_FILES) throw new Error('A folder must contain 1 to 128 files');
  const seen = new Set<string>();
  for (const path of paths) {
    const normalized = canonicalPath(safeRelative(path));
    if (path.split('/').length > 32) throw new Error('Folder path is too deep');
    if (seen.has(normalized) || [...seen].some(p => p.startsWith(normalized + '/') || normalized.startsWith(p + '/'))) throw new Error('Duplicate or conflicting folder path: ' + path);
    seen.add(normalized);
  }
}
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
function decodedLength(encoded: string): number {
  if (encoded.length % 4 !== 0 || encoded.length > Math.ceil(MAX_FOLDER_BYTES / 3) * 4) throw new Error('Invalid folder file encoding');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const body = padding ? encoded.slice(0, -padding) : encoded;
  // A simple character scan avoids a deeply repeated regex on multi-megabyte data.
  if (/[^A-Za-z0-9+/]/.test(body) || (padding && body.length < 2)) throw new Error('Invalid folder file encoding');
  return encoded.length / 4 * 3 - padding;
}
/** A bounded data container, not a new cipher. Encrypt these bytes using standard age. */
export function packFolder(files: FolderFile[]): Uint8Array {
  validatePaths(files.map(f => f.path));
  let total = 0;
  for (const file of files) {
    if (!(file.bytes instanceof Uint8Array)) throw new Error('Invalid folder file');
    total += file.bytes.length;
    if (total > MAX_FOLDER_BYTES) throw new Error('Folder contents exceed the 8 MiB prototype limit');
  }
  const container: EncodedFolder = { format: 'gitvault-folder', version: 1, files: files.map(file => ({ path: file.path, data: base64(file.bytes) })) };
  const bytes = new TextEncoder().encode(JSON.stringify(container));
  if (bytes.length > MAX_FOLDER_CONTAINER) throw new Error('Folder container exceeds the 12 MiB prototype limit');
  return bytes;
}
/** No archive inflation, links, executable metadata, or filesystem extraction. */
export function unpackFolder(bytes: Uint8Array): FolderFile[] {
  if (bytes.length > MAX_FOLDER_CONTAINER) throw new Error('Folder container exceeds the 12 MiB prototype limit');
  let data: EncodedFolder;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as EncodedFolder; }
  catch { throw new Error('Not a GitVault folder container. Use the regular viewer for ordinary documents.'); }
  if (!data || data.format !== 'gitvault-folder' || data.version !== 1 || !Array.isArray(data.files)) throw new Error('Unsupported GitVault folder format');
  if (data.files.length > MAX_FOLDER_FILES) throw new Error('A folder must contain 1 to 128 files');
  validatePaths(data.files.map(file => { if (!file || typeof file.path !== 'string') throw new Error('Invalid folder entry'); return file.path; }));
  let expectedTotal = 0;
  for (const file of data.files) {
    if (typeof file.data !== 'string') throw new Error('Invalid folder file encoding');
    expectedTotal += decodedLength(file.data);
    if (expectedTotal > MAX_FOLDER_BYTES) throw new Error('Folder contents exceed the 8 MiB prototype limit');
  }
  const files: FolderFile[] = [];
  try {
    for (const file of data.files) {
      const binary = atob(file.data);
      const decoded = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
      files.push({ path: file.path, bytes: decoded });
    }
    return files;
  } catch (error) { for (const file of files) file.bytes.fill(0); throw error; }
}
