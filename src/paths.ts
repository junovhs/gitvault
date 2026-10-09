import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { safeRelative } from './locator.js';
export { safeRelative, viewerUrl } from './locator.js';

export function confined(base: string, relative: string): string {
  const dest = path.resolve(base, safeRelative(relative));
  if (!dest.startsWith(path.resolve(base) + path.sep)) throw new Error('Path escapes directory');
  return dest;
}
/** Reject existing symlink components and hard-linked files. Not a hostile-process sandbox. */
export async function noSymlinks(root: string, relative: string): Promise<void> {
  const parts = safeRelative(relative).split('/');
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error('Symlinks and hard-linked files are not supported: ' + relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}
/** Enforce the limit while reading, not after allocating an unbounded file buffer. */
export async function readBounded(root: string, relative: string, limit: number): Promise<Buffer> {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid file-size limit');
  await noSymlinks(root, relative);
  const handle = await open(confined(root, relative), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink > 1) throw new Error('Expected a regular, unlinked file: ' + relative);
    if (info.size > limit) throw new Error('File exceeds size limit: ' + relative);
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, limit + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (!bytesRead) { chunk.fill(0); break; }
      total += bytesRead;
      if (total > limit) { chunk.fill(0); throw new Error('File grew beyond size limit: ' + relative); }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, total);
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    await handle.close();
  }
}
/** Atomic replacement of one file. A multi-file publish is not a filesystem transaction. */
export async function atomicWrite(root: string, relative: string, data: string | Uint8Array): Promise<void> {
  await noSymlinks(root, relative);
  const target = confined(root, relative);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = target + '.tmp-' + randomUUID();
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await noSymlinks(root, relative);
    await rename(temporary, target);
  } finally { await rm(temporary, { force: true }); }
}
