import path from 'node:path';

export function safeRelative(input: string): string {
  const normalized = input.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\\0') || normalized.split('/').some(s => s === '..' || s === '.' || !s)) throw new Error('Unsafe file path: ' + input);
  return normalized;
}
export function confined(base: string, relative: string): string {
  const dest = path.resolve(base, safeRelative(relative));
  if (!dest.startsWith(path.resolve(base) + path.sep)) throw new Error('Path escapes directory');
  return dest;
}
export function viewerUrl(site: string, repo: string, outputFile: string): string {
  const u = new URL(site);
  const q = new URLSearchParams({ repo, file: outputFile });
  u.search = q.toString();
  u.hash = '';
  return u.toString();
}
