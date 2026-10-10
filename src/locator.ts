/** Public locators only. Never put passwords or identities in a URL. */
export function validRepo(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) && !value.split('/').some(p => p === '.' || p === '..');
}
/** Accepts `owner/repo`, a GitHub URL, or a GitHub tree/blob URL pasted from the address bar. */
export function parseRepoInput(value: string): { repo: string; ref?: string; dir?: string } | null {
  let text = value.trim().replace(/^git@github\.com:/i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  text = text.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '');
  const [owner, name, kind, ref, ...rest] = text.split(/[?#]/)[0].split('/');
  const repo = owner + '/' + name;
  if (!owner || !name || !validRepo(repo)) return null;
  if ((kind === 'tree' || kind === 'blob') && ref) {
    const dir = (kind === 'blob' ? rest.slice(0, -1) : rest).map(decodeURIComponent).join('/');
    return { repo, ref: decodeURIComponent(ref), ...(dir ? { dir } : {}) };
  }
  return kind ? null : { repo };
}
export function canonicalPath(value: string): string { return value.normalize('NFC').toLowerCase(); }

export function safeRelative(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || /[\\\x00-\x1f\x7f:]/.test(value)) throw new Error('Unsafe relative path');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /^\.git$/i.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw new Error('Unsafe relative path');
  return value;
}
export function viewerUrl(site: string, repo: string, file: string, ref?: string): string {
  if (!validRepo(repo)) throw new Error('Expected owner/repo');
  safeRelative(file);
  const url = new URL(site);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) throw new Error('Viewer must use HTTPS (HTTP is allowed on localhost only)');
  url.search = '';
  url.hash = new URLSearchParams({ repo, file, ...(ref ? { ref } : {}) }).toString();
  return url.href;
}
