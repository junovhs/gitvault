import { safeRelative, validRepo } from './locator.js';
export type RepoEntry = { name: string; path: string; type: 'file' | 'dir' | 'symlink' | 'submodule'; size: number };
export const MAX_DOWNLOAD = 24 * 1024 * 1024;

export function contentsUrl(repo: string, file = '', ref = ''): string {
  if (!validRepo(repo)) throw new Error('Expected a public GitHub repository in owner/name format');
  if (file) safeRelative(file);
  const url = new URL('https://api.github.com/repos/' + repo + '/contents/' + file.split('/').map(encodeURIComponent).join('/'));
  if (ref) url.searchParams.set('ref', ref);
  return url.href;
}
async function request(url: string, accept: string, signal?: AbortSignal): Promise<Response> {
  const response = await fetch(url, { headers: { Accept: accept }, signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      throw new Error('GitHub API access was limited. ' + (reset ? 'Try after ' + new Date(reset * 1000).toLocaleTimeString() + '.' : 'Please try later.') + ' You can still open an encrypted file from your device.');
    }
    if (response.status === 404) throw new Error('Repository, branch or file not found. This viewer supports public repositories only.');
    throw new Error('GitHub request failed (' + response.status + ').');
  }
  return response;
}
export async function fetchDirectory(repo: string, dir = '', ref = '', signal?: AbortSignal): Promise<RepoEntry[]> {
  const response = await request(contentsUrl(repo, dir, ref), 'application/vnd.github+json', signal);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error('Expected a directory');
  return data.map((value: unknown) => {
    const e = value as RepoEntry;
    if (!e || typeof e.name !== 'string' || typeof e.path !== 'string' || !['file', 'dir', 'symlink', 'submodule'].includes(e.type)) throw new Error('Unexpected GitHub response');
    safeRelative(e.path);
    return e;
  });
}
export async function fetchBytes(repo: string, file: string, ref = '', signal?: AbortSignal): Promise<Uint8Array> {
  const response = await request(contentsUrl(repo, file, ref), 'application/vnd.github.raw+json', signal);
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD) throw new Error('File exceeds the 24 MiB download limit');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No file data returned');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.length;
      if (length > MAX_DOWNLOAD) { await reader.cancel(); throw new Error('File exceeds the 24 MiB download limit'); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
