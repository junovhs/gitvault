import path from 'node:path';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { safeRelative } from './locator.js';
export { safeRelative, viewerUrl } from './locator.js';

export function confined(base: string, relative: string): string {
  const dest = path.resolve(base, safeRelative(relative));
  if (!dest.startsWith(path.resolve(base) + path.sep)) throw new Error('Path escapes directory');
  return dest;
}

/** Check every existing component, not only entries returned by readdir. */
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
