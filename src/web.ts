import { fetchBytes, fetchDirectory, MAX_DOWNLOAD } from './github.js';
import { runCrypto, cancelCrypto } from './crypto-client.js';
import { lockKinds } from './crypto.js';
import { renderMarkdown } from './markdown.js';
import { parseRepoInput, safeRelative, validRepo, viewerUrl } from './locator.js';
import { createBundle } from './bundle.js';
import { decryptWithPasskey } from './passkeys.js';
import { renderPasskeyLab } from './passkey-lab.js';
import { workspaceItem } from './workspace.js';
import * as key from './key.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const DEMO_PASSWORD = 'gitvault-demo-not-a-secret';
const MAX_PLAIN = 16 * 1024 * 1024;
const MAX_KEY_FILE = 16384;
const RECENT = 'gitvault.recent.v1';
let generation = 0;
let aborter = new AbortController();
let cleaners: Array<() => void> = [];
let status: HTMLParagraphElement;
let main: HTMLElement;
let currentPlain: Uint8Array | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let keyIdleTimer: ReturnType<typeof setTimeout> | undefined;
/** A page can claim dropped files (e.g. key setup); otherwise drops open locked files or unlock your key. */
let dropHandler: ((file: File) => Promise<void>) | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(text: string, href: string, className = ''): HTMLAnchorElement {
  const a = el('a', text, className); a.href = href; a.rel = 'noreferrer noopener'; return a;
}
function route(values: Record<string, string>): string { return '#' + new URLSearchParams(values).toString(); }
function notify(text: string, error = false): void {
  status.textContent = text; status.className = 'status' + (error ? ' error' : '');
  status.setAttribute('role', error ? 'alert' : 'status');
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'Something went wrong.'; }
function action(label: string, fn: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const b = el('button', label, className); b.type = 'button';
  b.addEventListener('click', async () => {
    const version = generation;
    b.disabled = true;
    try { await fn(); } catch (error) { if (version === generation) notify(cancelled(error) ? 'Cancelled. Nothing was unlocked.' : message(error), true); }
    finally { if (b.isConnected) b.disabled = false; }
  });
  return b;
}
function cancelled(error: unknown): boolean { return error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError'); }
function input(parent: HTMLElement, title: string, options: { type?: string; placeholder?: string; value?: string; autocomplete?: string } = {}): HTMLInputElement {
  const label = el('label', title, 'field');
  const field = el('input'); field.type = options.type || 'text'; field.placeholder = options.placeholder || ''; field.value = options.value || '';
  field.autocomplete = (options.autocomplete || 'off') as AutoFill; field.spellcheck = false;
  label.append(field); parent.append(label); return field;
}
function size(bytes: number): string { return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB'; }
function download(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  const a = link('', url); a.download = name.replace(/[\\/\x00-\x1f]/g, '_'); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const picker = el('input'); picker.type = 'file'; picker.accept = accept; picker.hidden = true;
    picker.addEventListener('change', () => { resolve(picker.files?.[0] ?? null); picker.remove(); });
    picker.addEventListener('cancel', () => { resolve(null); picker.remove(); });
    document.body.append(picker); picker.click();
  });
}
async function readKeyFile(file: File): Promise<string> {
  if (file.size > MAX_KEY_FILE) throw new Error('That is too big to be a key file.');
  return file.text();
}
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms));

const LOCK_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="shackle" d="M21 29v-9a11 11 0 0 1 22 0v9" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/><rect class="body" x="12" y="28" width="40" height="29" rx="9"/><circle class="keyhole" cx="32" cy="41" r="4"/><rect class="keyhole" x="30.2" y="42" width="3.6" height="7" rx="1.8"/></svg>';
function lockIcon(className: string, open = false): HTMLElement {
  const d = el('div', '', 'lock ' + className + (open ? ' open' : '')); d.innerHTML = LOCK_SVG; return d;
}

function clearPrivate(): void {
  cancelCrypto();
  if (currentPlain) currentPlain.fill(0);
  currentPlain = null;
  clearTimeout(idleTimer);
  dropHandler = null;
  for (const cleanup of cleaners.splice(0)) cleanup();
}
function keyState(): 'none' | 'locked' | 'open' { return !key.loadKey() ? 'none' : key.isUnlocked() ? 'open' : 'locked'; }
function keyChip(): HTMLAnchorElement {
  const state = keyState();
  const a = link('', route({ page: 'key' }), 'key-chip'); a.id = 'key-chip'; a.dataset.state = state;
  a.append(lockIcon('mini', state === 'open'), el('span', state === 'none' ? 'Get your key' : state === 'open' ? 'Unlocked' : 'Locked'));
  a.setAttribute('aria-label', state === 'none' ? 'Get your key' : state === 'open' ? 'Your key is unlocked' : 'Your key is locked');
  return a;
}
function shell(active: string): void {
  clearPrivate(); aborter.abort(); aborter = new AbortController(); generation++;
  app.replaceChildren();
  const top = el('div', '', 'topbar'); const inside = el('div', '', 'topbar-inner');
  const brand = link('GitVault', '#', 'brand'); brand.prepend(lockIcon('brand-lock'));
  const nav = el('nav', '', 'nav'); nav.setAttribute('aria-label', 'Main navigation');
  const write = link('New note', route({ page: 'encrypt' }), 'nav-write');
  if (active === 'encrypt') write.setAttribute('aria-current', 'page');
  nav.append(write, keyChip());
  inside.append(brand, nav); top.append(inside); app.append(top);
  main = el('main', '', 'main'); main.id = 'main'; app.append(main);
  status = el('p', '', 'status'); status.setAttribute('aria-live', 'polite'); main.append(status);
  const footer = el('footer', '', 'footer');
  const links = el('span', '', 'footer-links');
  links.append(link('How it works', route({ page: 'about' })), link('More tools', route({ page: 'more' })), link('Security', 'https://github.com/junovhs/gitvault/blob/main/docs/SECURITY.md'));
  footer.append(el('span', 'Unlocks happen on your device. No account, no tracking. Early software: keep your key file backed up.'), links);
  app.append(footer);
}
function rememberCleanup(fn: () => void): void { cleaners.push(fn); }
function armAutoLock(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (currentPlain) void render(); }, 5 * 60 * 1000);
}
function armKeyLock(): void {
  clearTimeout(keyIdleTimer);
  if (key.isUnlocked()) keyIdleTimer = setTimeout(() => key.lockKey(), 15 * 60 * 1000);
}
key.onKeyChange(() => {
  document.getElementById('key-chip')?.replaceWith(keyChip());
  armKeyLock();
});

function recent(): string[] {
  try { const list = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(list) ? list.filter((r): r is string => typeof r === 'string' && validRepo(r)).slice(0, 5) : []; } catch { return []; }
}
function remember(repo: string): void { try { localStorage.setItem(RECENT, JSON.stringify([repo, ...recent().filter(r => r !== repo)].slice(0, 5))); } catch { /* storage may be unavailable */ } }

/** The unlock-your-key buttons used everywhere: phone/device passkeys first, then the key file. */
function keyButtons(parent: HTMLElement, onUnlocked: () => void | Promise<void>, primaryFile = false): void {
  const stored = key.loadKey();
  const seen = new Set<string>();
  for (const unlocker of stored?.unlockers ?? []) {
    if (seen.has(unlocker.kind)) continue; seen.add(unlocker.kind);
    parent.append(action(unlocker.kind === 'phone' ? 'Unlock with my phone' : 'Unlock with this computer', async () => {
      notify(unlocker.kind === 'phone' ? 'Scan the code with your phone, then approve with Face ID or fingerprint.' : 'Approve with Touch ID, Windows Hello or your device PIN.');
      const options = stored!.unlockers.filter(u => u.kind === unlocker.kind);
      let lastError: unknown;
      for (const option of options) {
        try { await key.unlockWithPasskey(option); notify('Your key is unlocked.'); await onUnlocked(); return; }
        catch (error) { if (cancelled(error)) throw error; lastError = error; }
      }
      throw lastError;
    }, 'primary big'));
  }
  parent.append(action(seen.size ? 'Use my key file instead' : 'Unlock with my key file', async () => {
    const file = await pickFile('.txt,.key,text/plain'); if (!file) return;
    await key.unlockWithRecovery(await readKeyFile(file)); notify('Your key is unlocked.'); await onUnlocked();
  }, seen.size && !primaryFile ? 'quiet' : 'primary big'));
}

function home(): void {
  document.title = 'GitVault | Your repo has a private side.';
  const hero = el('section', '', 'hero');
  hero.append(lockIcon('hero-lock'), el('h1', 'Your repo has a private side.'), el('p', 'Paste a GitHub repo. Unlock its secrets. That’s it.', 'lead'));
  const bar = el('div', '', 'repo-bar');
  const field = el('input'); field.placeholder = 'github.com/you/your-repo'; field.setAttribute('aria-label', 'GitHub repository'); field.autocomplete = 'off'; field.spellcheck = false; field.autocapitalize = 'off';
  const go = () => {
    const parsed = parseRepoInput(field.value);
    if (!parsed) throw new Error('That doesn’t look like a GitHub repo. Try owner/name.');
    location.hash = route({ repo: parsed.repo, ...(parsed.ref ? { ref: parsed.ref } : {}), ...(parsed.dir ? { dir: parsed.dir } : {}) });
  };
  field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); try { go(); } catch (e) { notify(message(e), true); } } });
  bar.append(field, action('Open', go, 'primary'));
  hero.append(bar);
  const chips = el('div', '', 'chips');
  for (const repo of recent()) chips.append(link(repo, route({ repo }), 'chip recent'));
  chips.append(link('Write a secret note', route({ page: 'encrypt' }), 'chip'), link('Try the demo', route({ repo: 'junovhs/gitvault', file: 'examples/private/welcome.md.age', ref: 'main', demo: '1' }), 'chip'));
  hero.append(chips, el('p', 'Or drop a locked file anywhere on this page.', 'hint'));
  main.append(hero);
  field.focus();
}

function crumbs(repo: string, dir: string, ref: string): HTMLElement {
  const row = el('nav', '', 'breadcrumbs'); row.setAttribute('aria-label', 'Repository path'); row.append(link(repo, route({ repo, ...(ref ? { ref } : {}) })));
  let current = '';
  for (const part of dir.split('/').filter(Boolean)) { current += (current ? '/' : '') + part; row.append(el('span', '/'), link(part, route({ repo, ...(ref ? { ref } : {}), dir: current }))); }
  return row;
}
async function browse(repo: string, dir: string, ref: string): Promise<void> {
  if (!validRepo(repo)) throw new Error('That doesn’t look like a GitHub repo. Try owner/name.'); if (dir) safeRelative(dir);
  document.title = repo + ' | GitVault';
  main.append(crumbs(repo, dir, ref));
  const title = el('h1', '', 'repo-title'); const [owner, name] = repo.split('/');
  title.append(el('span', owner + ' / ', 'owner'), document.createTextNode(name)); main.append(title);
  const version = generation; notify('Opening ' + repo + '…');
  const entries = await fetchDirectory(repo, dir, ref, aborter.signal); if (version !== generation) return;
  notify(''); remember(repo);
  const paths = new Set(entries.map(e => e.path));
  const visible = entries.filter(e => (e.type === 'file' || e.type === 'dir') && !e.name.endsWith('.qr.svg') && e.name !== '.gitvault-manifest.json'
    && !(e.type === 'file' && (paths.has(e.path + '.age') || (e.path.endsWith('.md') && paths.has(e.path.slice(0, -3) + '.age')))));
  const items = visible.map(entry => ({ entry, item: workspaceItem(repo, ref, entry) }))
    .sort((a, b) => Number(b.item.locked) - Number(a.item.locked) || Number(b.item.isFolder) - Number(a.item.isFolder) || a.item.label.localeCompare(b.item.label));
  const locked = items.filter(i => i.item.locked).length;

  const banner = el('section', '', 'unlock-banner');
  const paintBanner = () => {
    banner.replaceChildren(); banner.dataset.state = keyState();
    const copy = el('div', '', 'banner-copy');
    if (!locked) { copy.append(el('strong', 'No private files here yet.'), el('span', 'Add one and it will show up with a lock.')); banner.append(lockIcon('banner-lock'), copy, link('Add a secret note', route({ page: 'encrypt', repo, ...(ref ? { ref } : {}) }), 'button-link primary')); return; }
    const open = key.isUnlocked();
    banner.append(lockIcon('banner-lock', open));
    copy.append(el('strong', open ? 'Your key is unlocked.' : locked + (locked === 1 ? ' private file' : ' private files') + ' here.'), el('span', open ? 'Tap any private file to read it.' : 'Unlock your key once, then open anything.'));
    banner.append(copy);
    if (!open) { const buttons = el('div', '', 'banner-actions'); keyButtons(buttons, () => { paintBanner(); paintList(); }); banner.append(buttons); }
  };
  const list = el('div', '', 'file-list');
  const filter = el('input', '', 'filter'); filter.placeholder = 'Find a file'; filter.setAttribute('aria-label', 'Filter files'); filter.type = 'search';
  const paintList = () => {
    list.replaceChildren();
    const open = key.isUnlocked(); const query = filter.value.trim().toLowerCase();
    for (const { entry, item } of items.filter(i => !query || i.item.label.toLowerCase().includes(query))) {
      const a = link('', item.href, 'file-row' + (item.locked ? ' private' : ''));
      a.append(item.locked ? lockIcon('row-lock', open) : el('span', item.isFolder ? '▸' : '•', 'file-icon'));
      const copy = el('span', '', 'file-copy');
      copy.append(el('strong', item.label), el('span', item.isFolder ? 'Folder' : item.locked ? (item.detail.startsWith('Private folder') ? 'Private folder' : 'Private') : 'Public · ' + size(entry.size)));
      a.append(copy); if (item.locked) a.append(el('span', open ? 'Open' : 'Unlock', 'pill'));
      list.append(a);
    }
    if (!list.childElementCount) list.append(el('p', query ? 'Nothing matches.' : 'This folder is empty.', 'empty'));
  };
  filter.addEventListener('input', paintList);
  paintBanner(); paintList();
  rememberCleanup(key.onKeyChange(() => { paintBanner(); paintList(); }));
  main.append(banner); if (items.length > 12) main.append(filter); main.append(list);
  if (locked) main.append(link('+ Add a secret note to this repo', route({ page: 'encrypt', repo, ...(ref ? { ref } : {}) }), 'add-link'));
}

async function showRemote(repo: string, file: string, ref: string, demo: boolean): Promise<void> {
  safeRelative(file); if (!validRepo(repo)) throw new Error('That doesn’t look like a GitHub repo.');
  main.append(crumbs(repo, file.split('/').slice(0, -1).join('/'), ref));
  notify('Fetching ' + file.split('/').at(-1) + '…'); const version = generation;
  const bytes = await fetchBytes(repo, file, ref, aborter.signal); if (version !== generation) return;
  notify('');
  if (file.endsWith('.age')) await showEncrypted(file.split('/').at(-1)!, bytes, { repo, file, ref, demo });
  else { document.title = file.split('/').at(-1)! + ' | GitVault'; documentView(file.split('/').at(-1)!, bytes, false); }
}
type Remote = { repo: string; file: string; ref: string; demo: boolean };
async function showEncrypted(name: string, encrypted: Uint8Array, remote?: Remote): Promise<void> {
  const title = name.replace(/\.age$/, ''); document.title = title + ' | GitVault';
  const kinds = lockKinds(encrypted);
  const stage = el('section', '', 'unlock-stage');
  const lock = lockIcon('stage-lock');
  const heading = el('h1', title); const lead = el('p', '', 'lead');
  const actions = el('div', '', 'stage-actions');
  stage.append(lock, heading, lead, actions); main.append(stage);
  const lower = el('div', '', 'stage-footer');
  lower.append(action('Download locked file', () => download(name, encrypted), 'quiet'));
  if (remote) lower.append(link('Back to ' + remote.repo, route({ repo: remote.repo, ...(remote.ref ? { ref: remote.ref } : {}) }), 'quiet-link'));
  main.append(lower);
  const version = generation;
  const open = async (decrypt: () => Promise<Uint8Array>) => {
    const bytes = await decrypt();
    if (version !== generation) { bytes.fill(0); return; }
    lock.classList.add('open'); notify('');
    await pause(650);
    if (version !== generation) { bytes.fill(0); return; }
    stage.remove(); lower.remove(); currentPlain = bytes; armAutoLock();
    documentView(title, bytes, true, remote);
  };
  const withIdentity = (identity: string) => open(() => runCrypto({ kind: 'decrypt', bytes: encrypted, secret: { identity } }));
  const otherKeyFile = () => action('Use a different key file', async () => {
    const file = await pickFile('.txt,.key,text/plain'); if (!file) return;
    await withIdentity(key.parseIdentity(await readKeyFile(file)));
  }, 'quiet');
  let tried = false;
  const paint = () => {
    actions.replaceChildren();
    if (kinds.has('key')) {
      if (key.isUnlocked()) {
        if (!tried) {
          tried = true; lead.textContent = 'Opening with your key…';
          withIdentity(key.unlockedIdentity()).catch(() => { if (version !== generation) return; lead.textContent = 'This file was locked with a different key.'; paint(); });
          return;
        }
        actions.append(otherKeyFile());
      } else {
        lead.textContent = 'Locked with a key. Unlock your key to read it.';
        keyButtons(actions, () => undefined, !key.loadKey());
        if (!key.loadKey()) actions.append(el('p', 'Your key file is the gitvault-key.txt you saved when you made your key.', 'hint'));
      }
    }
    if (kinds.has('password')) {
      if (!kinds.has('key')) lead.textContent = 'Locked with a password.';
      const row = el('div', '', 'password-row');
      const secret = el('input'); secret.type = 'password'; secret.placeholder = 'Password'; secret.autocomplete = 'current-password'; secret.setAttribute('aria-label', 'Password');
      const unlock = action('Unlock', async () => {
        const value = secret.value; if (!value) { secret.focus(); throw new Error('Type the password first.'); }
        notify('Unlocking… this takes a moment on purpose.');
        try { await open(() => runCrypto({ kind: 'decrypt', bytes: encrypted, secret: { passphrase: value } })); }
        catch { if (version === generation) { notify('That password didn’t work. Try again.', true); secret.select(); } }
      }, 'primary big');
      secret.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); unlock.click(); } });
      row.append(secret, unlock); actions.append(row);
      rememberCleanup(() => { secret.value = ''; });
      if (remote?.demo) actions.append(action('Fill in the demo password', () => { secret.value = DEMO_PASSWORD; unlock.focus(); }, 'quiet'));
      if (!kinds.has('key')) setTimeout(() => secret.focus(), 0);
    }
    if (kinds.has('passkey')) {
      if (!kinds.has('key') && !kinds.has('password')) lead.textContent = 'Locked with a passkey.';
      actions.append(action('Unlock with passkey', async () => { notify('Approve with your passkey.'); await open(() => decryptWithPasskey(encrypted)); }, 'primary big'));
      if (!kinds.has('key')) actions.append(otherKeyFile());
    }
    if (!kinds.size) lead.textContent = 'GitVault doesn’t recognise this kind of lock. Download it and use the age command-line tool.';
  };
  paint();
  rememberCleanup(key.onKeyChange(paint));
  rememberCleanup(() => { encrypted.fill(0); });
}

function documentView(name: string, bytes: Uint8Array, privateFile: boolean, remote?: Remote): void {
  const paper = el('article', '', 'paper' + (privateFile ? ' unlocked' : ''));
  const toolbar = el('div', '', 'paper-bar');
  const label = el('div', '', 'paper-title');
  if (privateFile) label.append(lockIcon('mini', true));
  label.append(el('span', name)); toolbar.append(label);
  const tools = el('div', '', 'paper-tools'); toolbar.append(tools);
  paper.append(toolbar);
  let content: string | null;
  try { content = decoder.decode(bytes); if (content.includes('\0')) content = null; } catch { content = null; }
  const saveCopy = () => { download(name, bytes); if (privateFile) notify('An unlocked copy was saved to your device. It is no longer protected.'); };
  if (content === null) {
    tools.append(action(privateFile ? 'Save unlocked copy' : 'Download', saveCopy, 'quiet'));
    if (privateFile) tools.append(action('Lock', async () => { await render(); }, 'primary'));
    paper.append(el('p', 'This isn’t a text file. Save a copy to open it in another app.', 'empty'));
    main.append(paper); return;
  }
  const preview = el('div', '', 'markdown');
  const editor = el('textarea', '', 'editor'); editor.setAttribute('aria-label', 'Edit document'); editor.spellcheck = true; editor.hidden = true;
  renderMarkdown(preview, content); editor.value = content;
  if (privateFile) {
    const edit = action('Edit', () => {
      const editing = editor.hidden; editor.hidden = !editing; preview.hidden = editing;
      if (editing) { edit.textContent = 'Done'; editor.focus(); } else { edit.textContent = 'Edit'; renderMarkdown(preview, editor.value); }
      save.hidden = editor.value === content && !editing;
    }, 'quiet');
    const save = action('Lock changes', () => {
      const draft = { name, text: editor.value, repo: remote?.repo, ref: remote?.ref, dir: remote?.file.split('/').slice(0, -1).join('/') };
      shell('encrypt'); lockScreen(draft);
    }, 'quiet'); save.hidden = true;
    editor.addEventListener('input', () => { save.hidden = editor.value === content; });
    tools.append(edit, save, action('Save unlocked copy', saveCopy, 'quiet'), action('Lock', async () => { await render(); }, 'primary'));
  } else tools.append(action('Download', saveCopy, 'quiet'));
  paper.append(preview, editor);
  main.append(paper);
  if (!privateFile) main.append(el('p', 'This file is public. Anyone can read it on GitHub.', 'hint center'));
  rememberCleanup(() => { editor.value = ''; preview.replaceChildren(); content = null; });
}

/** Strong, readable, randomly generated: 5 groups of 5 from a 32-symbol alphabet (125 bits, unbiased). */
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; const bytes = crypto.getRandomValues(new Uint8Array(25));
  let out = ''; for (let i = 0; i < 25; i++) { out += alphabet[bytes[i] & 31]; if (i % 5 === 4 && i < 24) out += '-'; }
  bytes.fill(0); return out;
}
function slug(title: string): string {
  const base = title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return (base || 'secret-note') + '.md';
}
type Draft = { name?: string; text?: string; repo?: string; ref?: string; dir?: string };
function lockScreen(draft: Draft = {}): void {
  document.title = 'New note | GitVault';
  const params = new URLSearchParams(location.hash.slice(1));
  const repoParam = params.get('page') === 'encrypt' && validRepo(params.get('repo') || '') ? params.get('repo')! : '';
  const target = { repo: draft.repo || repoParam, ref: draft.ref ?? (repoParam ? params.get('ref') || '' : ''), dir: draft.dir || 'private' };
  const sheet = el('section', '', 'note-sheet');
  const nameField = el('input', '', 'note-title'); nameField.placeholder = 'Untitled secret'; nameField.setAttribute('aria-label', 'Note title'); nameField.autocomplete = 'off';
  if (draft.name) nameField.value = draft.name.replace(/\.md$/, '');
  const body = el('textarea', '', 'note-body'); body.placeholder = 'Write anything. Only you will be able to read it.'; body.setAttribute('aria-label', 'Private note'); body.value = draft.text ?? '';
  let attached: File | null = null;
  const attachedRow = el('div', '', 'attached'); attachedRow.hidden = true;
  const attach = action('or lock a file instead', async () => {
    const file = await pickFile(''); if (!file) return;
    safeRelative(file.name); if (file.size > MAX_PLAIN) throw new Error('That file is over the 16 MB limit.');
    attached = file; body.hidden = true; nameField.hidden = true;
    attachedRow.replaceChildren(el('strong', file.name), el('span', size(file.size), 'hint'), action('Remove', () => { attached = null; body.hidden = false; nameField.hidden = false; attachedRow.hidden = true; attach.hidden = false; }, 'quiet'));
    attachedRow.hidden = false; attach.hidden = true;
  }, 'quiet small');
  sheet.append(nameField, body, attachedRow, attach);

  let mode: 'key' | 'password' = 'key';
  const how = el('div', '', 'lock-with');
  const seg = el('div', '', 'segmented'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Lock with');
  const mine = action('Only me', () => setMode('key'), 'seg'); const shared = action('Share with a password', () => setMode('password'), 'seg');
  seg.append(mine, shared); how.append(seg);
  const passwordBox = el('div', '', 'password-box'); passwordBox.hidden = true;
  const generated = el('code', generatePassword(), 'generated');
  const own = el('input'); own.type = 'password'; own.placeholder = 'Or type your own (16+ characters)'; own.setAttribute('aria-label', 'Your own password'); own.autocomplete = 'new-password';
  const passwordTools = el('div', '', 'row');
  passwordTools.append(action('Copy', async () => { await navigator.clipboard.writeText(generated.textContent || ''); notify('Password copied. Paste it somewhere safe.'); }, 'quiet'), action('New one', () => { generated.textContent = generatePassword(); }, 'quiet'));
  passwordBox.append(el('span', 'Send this password separately to the person you share with:', 'hint'), generated, passwordTools, own);
  how.append(passwordBox);
  const keyHint = el('p', '', 'hint'); how.append(keyHint);
  function setMode(next: 'key' | 'password'): void {
    mode = next; mine.setAttribute('aria-pressed', String(next === 'key')); shared.setAttribute('aria-pressed', String(next === 'password'));
    passwordBox.hidden = next !== 'password';
    keyHint.textContent = next === 'key' ? (key.loadKey() ? 'Locked to your key. You can open it anywhere with your phone or key file.' : 'First time? We’ll make your key in a few seconds.') : '';
  }
  setMode('key');

  const where = el('details', '', 'where');
  where.append(el('summary', target.repo ? 'Goes in ' + target.repo + ' / ' + target.dir : 'Put it in a repo (optional)'));
  const repoField = input(where, 'Repository', { placeholder: 'owner/repo', value: target.repo });
  const dirField = input(where, 'Folder in the repo', { value: target.dir });
  sheet.append(how, where);
  const lockButton = action('Lock it', () => perform(), 'primary huge');
  sheet.append(lockButton);
  const setup = el('section', '', 'setup-panel'); setup.hidden = true;
  main.append(sheet, setup);
  if (!draft.text) setTimeout(() => (draft.name ? body : nameField).focus(), 0);
  rememberCleanup(() => { body.value = ''; own.value = ''; generated.textContent = ''; attached = null; });

  const version = generation;
  async function perform(): Promise<void> {
    const file = attached ?? (() => {
      if (!body.value.trim()) { body.focus(); throw new Error('Write something first.'); }
      const keepName = draft.name && nameField.value === draft.name.replace(/\.md$/, '');
      return new File([encoder.encode(body.value)], keepName ? draft.name! : slug(nameField.value), { type: 'text/markdown' });
    })();
    safeRelative(file.name);
    const repo = parseRepoInput(repoField.value)?.repo ?? '';
    if (repoField.value.trim() && !repo) throw new Error('That repo doesn’t look right. Use owner/name.');
    let secret: { recipient: string } | { passphrase: string };
    if (mode === 'key') {
      const stored = key.loadKey();
      if (!stored) { sheet.hidden = true; setup.hidden = false; setup.replaceChildren(); keySetup(setup, () => { setup.hidden = true; sheet.hidden = false; setMode('key'); void lockButton.click(); }); return; }
      secret = { recipient: stored.recipient };
    } else {
      const chosen = own.value || generated.textContent || '';
      if (own.value && own.value.length < 16) throw new Error('Use at least 16 characters, or use the generated password.');
      secret = { passphrase: chosen };
    }
    notify('Locking on this device…');
    const plain = new Uint8Array(await file.arrayBuffer());
    let encrypted: Uint8Array;
    try { if (version !== generation) return; encrypted = await runCrypto({ kind: 'encrypt', bytes: plain, secret }); } finally { plain.fill(0); }
    if (version !== generation) { encrypted.fill(0); return; }
    const output = dirField.value.trim() || 'private';
    const options = { repo, output, name: file.name, viewer: new URL(location.pathname, location.origin).href, ref: target.ref || undefined };
    let bundle: Awaited<ReturnType<typeof createBundle>> | undefined;
    if (repo) { viewerUrl(options.viewer, repo, safeRelative(output) + '/' + file.name + '.age', options.ref); bundle = await createBundle(encrypted, options); if (version !== generation) return; }
    const sharedPassword = mode === 'password' ? (own.value ? '' : generated.textContent || '') : '';
    own.value = ''; body.value = '';
    sheet.remove(); notify('');
    const done = el('section', '', 'done-stage');
    const lock = lockIcon('stage-lock', true); done.append(lock, el('h1', 'Locked.'));
    done.append(el('p', bundle ? 'Unzip this into ' + repo + ' and commit. It will open from GitHub, with a link and a QR code.' : 'Put this file in any repo. It opens right here, from anywhere.', 'lead'));
    const buttons = el('div', '', 'stage-actions');
    if (bundle) buttons.append(action('Download for ' + repo, () => download(file.name + '.gitvault.zip', bundle!.zip, 'application/zip'), 'primary big'));
    buttons.append(action(bundle ? 'Just the locked file' : 'Download locked file', () => download(file.name + '.age', encrypted), bundle ? 'quiet' : 'primary big'));
    done.append(buttons);
    if (sharedPassword) { const box = el('div', '', 'password-box'); box.append(el('span', 'The password (send it separately, never in the repo):', 'hint'), el('code', sharedPassword, 'generated')); done.append(box); }
    if (bundle) done.append(link('Where it will open', bundle.url, 'quiet-link'));
    done.append(link('Write another', route({ page: 'encrypt', ...(repo ? { repo } : {}) }), 'quiet-link'));
    main.append(done);
    requestAnimationFrame(() => setTimeout(() => lock.classList.remove('open'), reducedMotion() ? 0 : 120));
    rememberCleanup(() => { encrypted.fill(0); });
  }
}

/** Make your key: save it, hand it back to prove it is saved, then optionally add your phone. */
function keySetup(parent: HTMLElement, done: () => void): void {
  const steps = el('ol', '', 'steps');
  const step = (n: number, title: string) => { const li = el('li', '', 'step'); li.dataset.step = String(n); li.append(el('h2', title)); steps.append(li); return li; };
  parent.append(lockIcon('stage-lock'), el('h1', 'Make your key.'), el('p', 'One key opens all your private files. Your phone can unlock it with Face ID.', 'lead'), steps);
  const one = step(1, 'Save your key file');
  const two = step(2, 'Drop it back here'); two.classList.add('waiting');
  const three = step(3, 'Unlock with your phone'); three.classList.add('waiting');
  let pending: key.PendingKey | null = null;
  one.append(el('p', 'It’s your spare key. Keep it somewhere safe, like a password manager or a USB stick. Never put it in a repo.', 'hint'));
  const make = action('Make my key', async () => {
    pending = await key.createKey();
    download('gitvault-key.txt', encoder.encode(pending.file), 'text/plain');
    make.textContent = 'Download it again'; one.classList.add('done'); two.classList.remove('waiting');
    notify('Saved gitvault-key.txt. Now drop it back in to prove you have it.');
    dropHandler = confirm;
  }, 'primary big');
  one.append(make, action('I already have a key file', async () => {
    const file = await pickFile('.txt,.key,text/plain'); if (!file) return;
    await key.unlockWithRecovery(await readKeyFile(file)); finish12();
  }, 'quiet'));
  const confirm = async (file: File) => {
    if (!pending) throw new Error('Make your key first.');
    await key.confirmRecovery(pending, await readKeyFile(file)); finish12();
  };
  two.append(el('p', 'This proves your spare key really saved. Drag gitvault-key.txt onto this page, or choose it.', 'hint'));
  two.append(action('Choose gitvault-key.txt', async () => { const file = await pickFile('.txt,.key,text/plain'); if (file) await confirm(file); }, 'primary big'));
  const finish12 = () => {
    pending = null; dropHandler = null;
    one.classList.add('done'); two.classList.remove('waiting'); two.classList.add('done'); three.classList.remove('waiting');
    notify('Your key is ready and unlocked.');
    addPhone(three, done);
  };
  rememberCleanup(() => { pending = null; });
}
function addPhone(parent: HTMLElement, done: () => void): void {
  parent.append(el('p', 'Next time, scan a code with your phone and approve with Face ID or your fingerprint. Needs iPhone iOS 18.4+ or Android with Google Password Manager.', 'hint'));
  const finished = (text: string) => { parent.classList.add('done'); done(); notify(text); };
  if (key.passkeysSupported()) {
    parent.append(action('Add my phone', async () => {
      notify('Scan the code with your phone and approve. You’ll be asked twice: once to create, once to lock your key to it.');
      await key.addUnlocker('phone'); finished('Your phone is now your key.');
    }, 'primary big'));
    parent.append(action('Use this computer instead', async () => {
      notify('Approve with Touch ID, Windows Hello or your device PIN, twice.');
      await key.addUnlocker('device'); finished('This computer can now unlock your key.');
    }, 'quiet'));
  }
  parent.append(action('Not now', () => finished('Done. Use your key file to unlock.'), 'quiet'));
}

function keyPage(): void {
  document.title = 'Your key | GitVault';
  const page = el('section', '', 'key-page'); main.append(page);
  let settingUp = false;
  const paint = () => {
    if (settingUp) return; // let the setup steps finish before showing settings
    page.replaceChildren();
    const stored = key.loadKey();
    if (!stored) { settingUp = true; keySetup(page, () => { settingUp = false; void render(); }); return; }
    const open = key.isUnlocked();
    page.append(lockIcon('stage-lock', open), el('h1', open ? 'Your key is unlocked.' : 'Your key is locked.'));
    page.append(el('p', open ? 'Private files open instantly in this tab. It locks itself after 15 quiet minutes or when you close the tab.' : 'Unlock it once to open all your private files.', 'lead'));
    const actions = el('div', '', 'stage-actions'); page.append(actions);
    if (!open) { keyButtons(actions, () => undefined); return; }
    actions.append(action('Lock now', () => key.lockKey(), 'primary big'));
    const ways = el('ul', '', 'ways');
    stored.unlockers.forEach((u, index) => {
      const li = el('li'); li.append(el('strong', u.kind === 'phone' ? 'Phone' : 'This computer'), el('span', 'Added ' + new Date(u.added).toLocaleDateString(), 'hint'), action('Remove', () => key.removeUnlocker(index), 'quiet'));
      ways.append(li);
    });
    const fileWay = el('li'); fileWay.append(el('strong', 'Key file'), el('span', 'Always works, on any device', 'hint'), action('Save it again', () => download('gitvault-key.txt', encoder.encode(key.recoveryFile(key.unlockedIdentity(), stored.recipient)), 'text/plain'), 'quiet'));
    ways.append(fileWay);
    page.append(el('h2', 'Ways to unlock'), ways);
    const more = el('div', '', 'phone-add'); page.append(more);
    if (key.passkeysSupported()) {
      more.append(action('Add my phone', async () => { notify('Scan the code with your phone and approve, twice.'); await key.addUnlocker('phone'); notify('Your phone is now your key.'); }, 'quiet'),
        action('Add this computer', async () => { notify('Approve with Touch ID, Windows Hello or your PIN, twice.'); await key.addUnlocker('device'); notify('This computer can now unlock your key.'); }, 'quiet'));
    }
    const details = el('details', '', 'fine-print');
    details.append(el('summary', 'Public key and device settings'), el('p', 'Your public key (safe to share; people can lock files for you with it):', 'hint'), el('code', stored.recipient, 'generated'));
    details.append(action('Forget my key on this device', () => { if (confirm('Forget your key on this device? You will need your key file to set it up again.')) { key.forgetKey(); try { localStorage.removeItem(RECENT); } catch { /* ignore */ } } }, 'quiet danger'));
    page.append(details);
  };
  paint();
  rememberCleanup(key.onKeyChange(paint));
}

function openPage(): void {
  document.title = 'Open a locked file | GitVault';
  const zone = el('section', '', 'drop-zone');
  zone.append(lockIcon('stage-lock'), el('h1', 'Drop a locked file here.'), el('p', 'Opening a file from your computer never contacts GitHub.', 'lead'));
  zone.append(action('Choose a file', async () => { const file = await pickFile('.age,.txt,application/octet-stream'); if (file) await openLocal(file); }, 'primary big'));
  main.append(zone);
}
async function openLocal(file: File): Promise<void> {
  if (file.size > MAX_DOWNLOAD) throw new Error('That file is over the 24 MB limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  shell('open');
  try { await showEncrypted(file.name, bytes); } catch (error) { bytes.fill(0); notify(message(error), true); }
}
async function dropped(file: File): Promise<void> {
  if (dropHandler) return dropHandler(file);
  if (file.size <= MAX_KEY_FILE) {
    const content = await file.text();
    if (content.includes('AGE-SECRET-KEY-')) { await key.unlockWithRecovery(content); notify('Your key is unlocked.'); return; }
  }
  return openLocal(file);
}

function more(): void {
  document.title = 'More tools | GitVault';
  const page = el('section', '', 'plain-page');
  page.append(el('h1', 'More tools'), el('p', 'You won’t need these day to day.', 'lead'));
  const list = el('ul', '', 'ways');
  for (const [title, text, href] of [
    ['Open a locked file', 'From a download or a clone.', route({ page: 'open' })],
    ['Private folders', 'Hide file names too. Experimental.', './folder.html'],
    ['Make a private folder', 'Lock a whole folder as one file. Experimental.', './folder.html#mode=encrypt'],
    ['Passkey lab', 'Lock a file directly to a passkey. Experimental.', route({ page: 'passkeys' })],
    ['How it works', 'The whole idea in one page.', route({ page: 'about' })],
    ['Security model', 'What GitVault protects, and what it doesn’t.', 'https://github.com/junovhs/gitvault/blob/main/docs/SECURITY.md'],
  ]) { const li = el('li'); li.append(link(title, href), el('span', text, 'hint')); list.append(li); }
  page.append(list); main.append(page);
}
function about(): void {
  document.title = 'How it works | GitVault';
  const page = el('section', '', 'plain-page');
  page.append(el('h1', 'How it works'), el('p', 'Your repo is public. Some files in it are locked. GitVault opens them on your device.', 'lead'));
  const steps = el('ol', '', 'explain');
  for (const [title, text] of [
    ['You lock a note', 'It’s encrypted on your device with your key (standard age encryption). Only the locked file goes in your repo.'],
    ['GitHub keeps the locked copy', 'Anyone can see the file exists. Nobody can read it without your key.'],
    ['You open it from anywhere', 'Open the repo here, scan the code with your phone, approve with Face ID. The file unlocks on your screen. Nothing is sent anywhere.'],
    ['Your key file is your spare', 'If you lose your phone, your key file still opens everything, here or with the standard age command-line tool.'],
  ]) { const li = el('li'); li.append(el('strong', title), el('p', text)); steps.append(li); }
  page.append(steps);
  page.append(el('h2', 'Good to know'), el('p', 'File names, sizes and history are public on GitHub. Locking a file does not remove older unlocked copies from Git history. Trust the site you unlock on; check the address bar says junovhs.github.io. GitVault is early software that has not been independently audited, so keep your key file backed up.', 'hint'));
  page.append(el('p', 'Phone unlock uses standard passkeys (WebAuthn PRF). It needs a recent phone and browser: iPhone with iOS 18.4+, or Android with Google Password Manager, plus Chrome, Edge, Safari 18+ or desktop Firefox on the computer. It has been tested with simulated authenticators, not yet on every real phone.', 'hint'));
  main.append(page);
}

async function render(): Promise<void> {
  const p = new URLSearchParams(location.hash.length > 1 ? location.hash.slice(1) : location.search);
  const page = p.get('page') || ''; shell(page);
  const version = generation;
  try {
    if (!isSecureContext) throw new Error('Open GitVault over HTTPS. Unlocking is disabled on insecure pages.');
    if (page === 'encrypt') lockScreen();
    else if (page === 'key') keyPage();
    else if (page === 'open') openPage();
    else if (page === 'passkeys') {
      const header = el('section', '', 'plain-page'); header.append(el('h1', 'Passkey lab'), el('p', 'Experimental: lock a file directly to a passkey, with a separate recovery key.', 'lead')); main.append(header);
      renderPasskeyLab(main, { notify, isCurrent: () => generation === version, onCleanup: rememberCleanup });
    }
    else if (page === 'more') more();
    else if (page === 'about') about();
    else if (p.get('repo') && p.get('file')?.endsWith('.gvfolder.age')) {
      // Preserve older document-viewer links while sending folder containers to their proper viewer.
      location.replace('./folder.html' + route({ repo: p.get('repo')!, file: p.get('file')!, ...(p.get('ref') ? { ref: p.get('ref')! } : {}) }));
    }
    else if (p.get('repo') && p.get('file')) await showRemote(p.get('repo')!, p.get('file')!, p.get('ref') || '', p.get('demo') === '1');
    else if (p.get('repo')) await browse(p.get('repo')!, p.get('dir') || '', p.get('ref') || '');
    else home();
  } catch (e) { if (version === generation && !(e instanceof DOMException && e.name === 'AbortError')) notify(message(e), true); }
}
window.addEventListener('hashchange', () => { void render(); });
// A link to the page you are already on (New note, Write another) starts that page fresh.
document.addEventListener('click', event => {
  const a = (event.target as Element | null)?.closest?.('a');
  if (a && a.getAttribute('href')?.startsWith('#') && a.getAttribute('href') === location.hash && !event.defaultPrevented) { event.preventDefault(); void render(); }
});
window.addEventListener('pagehide', () => { clearPrivate(); key.lockKey(); });
window.addEventListener('pageshow', event => { if (event.persisted) void render(); });
for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => { if (currentPlain) armAutoLock(); if (key.isUnlocked()) armKeyLock(); }, { passive: true });
window.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); document.body.classList.add('dropping'); } });
window.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dropping'); });
window.addEventListener('drop', event => {
  const file = event.dataTransfer?.files[0]; if (!file) return;
  event.preventDefault(); document.body.classList.remove('dropping');
  const version = generation;
  dropped(file).catch(error => { if (version === generation || status.isConnected) notify(message(error), true); });
});
void render();
