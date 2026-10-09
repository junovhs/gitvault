import { zipSync } from 'fflate';
import { packFolder, unpackFolder, MAX_FOLDER_FILES, MAX_FOLDER_BYTES, type FolderFile } from './folder-format.js';
import { createBundle } from './bundle.js';
import { fetchBytes, MAX_DOWNLOAD } from './github.js';
import { runCrypto, cancelCrypto } from './crypto-client.js';
import { safeRelative, viewerUrl } from './locator.js';
import { renderMarkdown } from './markdown.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
let epoch = 0;
let controller = new AbortController();
let clear: Array<() => void> = [];
let files: FolderFile[] = [];
let main: HTMLElement;
let status: HTMLElement;
let idle: ReturnType<typeof setTimeout> | undefined;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function anchor(text: string, href: string, className = ''): HTMLAnchorElement { const a = el('a', text, className); a.href = href; a.rel = 'noreferrer noopener'; return a; }
function notify(message: string, error = false): void { status.textContent = message; status.className = 'status' + (error ? ' error' : ''); status.setAttribute('role', error ? 'alert' : 'status'); }
function button(text: string, fn: () => void | Promise<void>, className = 'secondary'): HTMLButtonElement {
  const b = el('button', text, className); b.type = 'button';
  b.addEventListener('click', async () => { const version = epoch; b.disabled = true; try { await fn(); } catch (e) { if (version === epoch) notify(e instanceof Error ? e.message : 'Operation failed', true); } finally { if (b.isConnected) b.disabled = false; } });
  return b;
}
function input(parent: HTMLElement, label: string, type = 'text', value = ''): HTMLInputElement {
  const wrapper = el('label', label, 'field'); const field = el('input'); field.type = type; field.value = value; field.autocomplete = 'off'; field.spellcheck = false; wrapper.append(field); parent.append(wrapper); return field;
}
function method(parent: HTMLElement, label: string, encrypting: boolean): HTMLSelectElement {
  const wrapper = el('label', label, 'field'); const select = el('select');
  for (const [value, text] of [['passphrase', 'Password'], [encrypting ? 'recipient' : 'identity', encrypting ? 'Public age recipient' : 'Private age identity']]) { const option = el('option', text); option.value = value; select.append(option); }
  wrapper.append(select); parent.append(wrapper); return select;
}
function card(title: string): HTMLElement { const c = el('section', '', 'card'); c.append(el('h2', title)); return c; }
function heading(title: string, copy: string): void { const h = el('header', '', 'page-heading'); h.append(el('p', 'EXPERIMENTAL / ENCRYPTED FOLDERS', 'eyebrow'), el('h1', title), el('p', copy, 'lead')); main.append(h); }
function cleanup(): void {
  cancelCrypto(); clearTimeout(idle);
  for (const file of files) file.bytes.fill(0); files = [];
  for (const fn of clear.splice(0)) fn();
}
function layout(): void {
  cleanup(); controller.abort(); controller = new AbortController(); epoch++;
  app.replaceChildren();
  const top = el('div', '', 'topbar'); const inside = el('div', '', 'topbar-inner'); const brand = anchor('GitVault', './', 'brand'); brand.prepend(el('span', 'G', 'brand-mark'));
  const nav = el('nav', '', 'nav'); nav.setAttribute('aria-label', 'Folder navigation'); nav.append(anchor('Workspace', './'), anchor('Open folder', './folder.html'), anchor('Add folder', './folder.html#mode=encrypt'));
  inside.append(brand, nav); top.append(inside); app.append(top);
  main = el('main', '', 'main'); status = el('p', '', 'status'); status.setAttribute('aria-live', 'polite'); main.append(status); app.append(main);
  const footer = el('footer', '', 'footer'); footer.append(el('span', 'One encrypted file. Internal filenames stay inside it.'), anchor('Folder format & limits', 'https://github.com/junovhs/gitvault/blob/main/docs/FOLDERS.md')); app.append(footer);
}
function download(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })); const a = anchor('', url); a.download = name.replace(/[\\/\x00-\x1f]/g, '_'); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function armLock(): void { clearTimeout(idle); idle = setTimeout(() => { if (files.length) void render(); }, 300000); }
function security(parent: HTMLElement): void { parent.append(el('p', 'Experimental, unaudited software. Use test folders. The outer filename, aggregate size and Git history remain public.', 'security-note')); }

function createScreen(): void {
  heading('Keep the names private, too.', 'Pack a small folder into one encrypted file. GitHub sees the outer file and landing page, not the names or contents inside.');
  const grid = el('div', '', 'encrypt-grid'); const form = card('1. Select a private folder'); const settings = card('2. Choose how to publish it');
  const selected = input(form, 'Private folder on this device', 'file'); selected.setAttribute('webkitdirectory', ''); selected.multiple = true;
  form.append(el('p', 'Up to 128 files and 8 MiB total. The selected outer folder name is omitted from the encrypted internal paths.', 'small muted'));
  const how = method(form, 'Folder encryption method', true); const secret = input(form, 'Folder password or public recipient', 'password'); const confirm = input(form, 'Confirm folder password', 'password');
  how.addEventListener('change', () => { secret.type = how.value === 'recipient' ? 'text' : 'password'; confirm.parentElement!.hidden = how.value === 'recipient'; secret.value = ''; confirm.value = ''; });
  const name = input(settings, 'Public bundle name', 'text', 'private-folder');
  settings.append(el('p', 'Use a non-sensitive outer name. Internal filenames are encrypted, but this name is public.', 'small muted'));
  const repo = input(settings, 'Public repository for folder bundle'); repo.placeholder = 'owner/repository';
  const output = input(settings, 'Folder artifacts directory', 'text', 'private-folders');
  const results = el('section', '', 'results'); const version = epoch;
  const perform = async (bundle: boolean) => {
    const sources = [...(selected.files || [])];
    if (!sources.length || sources.length > MAX_FOLDER_FILES) throw new Error('Choose a folder with 1 to 128 files');
    if (sources.reduce((n, f) => n + f.size, 0) > MAX_FOLDER_BYTES) throw new Error('Folder contents exceed the 8 MiB prototype limit');
    if (how.value === 'passphrase' && (secret.value.length < 16 || secret.value !== confirm.value)) throw new Error('Use at least 16 characters and confirm the same password');
    if (how.value === 'recipient' && !secret.value.trim().startsWith('age1')) throw new Error('Enter an age public recipient beginning age1');
    const publicName = safeRelative(name.value.trim()) + '.gvfolder';
    if (publicName.includes('/')) throw new Error('The public bundle name must be a filename, not a path');
    const viewer = new URL('./folder.html', location.href).href;
    const options = { repo: repo.value.trim(), output: output.value, name: publicName, viewer };
    if (bundle) viewerUrl(viewer, options.repo, safeRelative(options.output) + '/' + publicName + '.age');
    const chosen = how.value; let value = secret.value;
    const originals: FolderFile[] = []; let container: Uint8Array | undefined;
    notify('Packing and encrypting locally. No files are being uploaded...');
    let encrypted: Uint8Array;
    try {
      for (const source of sources) {
        if (version !== epoch) return;
        const path = source.webkitRelativePath ? source.webkitRelativePath.split('/').slice(1).join('/') : source.name;
        originals.push({ path, bytes: new Uint8Array(await source.arrayBuffer()) });
      }
      container = packFolder(originals);
      if (version !== epoch) return;
      encrypted = await runCrypto({ kind: 'encrypt', bytes: container, secret: chosen === 'recipient' ? { recipient: value.trim() } : { passphrase: value } });
    } finally { value = ''; if (container) container.fill(0); for (const file of originals) file.bytes.fill(0); }
    if (version !== epoch) return;
    results.replaceChildren(el('p', 'Folder encrypted. Internal names and contents are inside the ciphertext.', 'success-message'));
    results.append(button('Download encrypted folder', () => download(publicName + '.age', encrypted), 'primary'));
    if (bundle) {
      const packaged = await createBundle(encrypted, options); if (version !== epoch) return;
      results.append(button('Download folder GitHub bundle', () => download(publicName + '.gitvault.zip', packaged.zip, 'application/zip')));
      results.append(el('p', 'Commit only the downloaded ciphertext and public landing assets. Then:'), anchor('Open the folder viewer link', packaged.url));
    }
    secret.value = ''; confirm.value = ''; notify('Encrypted folder ready. The recovery method is the password or identity you selected.');
  };
  const actions = el('div', '', 'toolbar'); actions.append(button('Encrypt folder', () => perform(false), 'primary'), button('Encrypt folder + GitHub bundle', () => perform(true)));
  form.append(actions); grid.append(form, settings); main.append(grid, results); security(main);
  clear.push(() => { selected.value = ''; secret.value = ''; confirm.value = ''; });
}

function picker(): void {
  heading('Open your private folder.', 'Choose an encrypted GitVault folder file from this device, or follow its GitHub landing-page link.');
  const box = card('Open an encrypted folder'); const selected = input(box, 'Encrypted folder file', 'file'); selected.accept = '.age';
  box.append(button('Open encrypted folder', async () => {
    const file = selected.files?.[0]; if (!file) throw new Error('Choose an encrypted folder file');
    if (file.size > MAX_DOWNLOAD) throw new Error('Encrypted file exceeds the 24 MiB prototype limit');
    const version = epoch; const bytes = new Uint8Array(await file.arrayBuffer()); if (version !== epoch) return;
    layout(); unlock(file.name, bytes);
  }, 'primary')); main.append(box); security(main);
}
function unlock(name: string, encrypted: Uint8Array): void {
  heading('A whole folder, under one lock.', name + ' contains encrypted internal filenames and file contents.');
  const box = card('Unlock folder locally'); const how = method(box, 'Folder unlock method', false);
  const secret = input(box, 'Folder password or private identity', 'password'); const key = input(box, 'Folder identity file (optional)', 'file'); key.parentElement!.hidden = true;
  how.addEventListener('change', () => { key.parentElement!.hidden = how.value !== 'identity'; secret.value = ''; key.value = ''; });
  const version = epoch;
  box.append(button('Unlock folder', async () => {
    let value = secret.value; const chosen = how.value;
    if (chosen === 'identity' && key.files?.[0]) { if (key.files[0].size > 16384) throw new Error('Identity file is unexpectedly large'); value = await key.files[0].text(); }
    if (!value) throw new Error('Enter the folder password or private identity');
    if (version !== epoch) return;
    notify('Decrypting folder locally...');
    let plain: Uint8Array | undefined;
    try {
      plain = await runCrypto({ kind: 'decrypt', bytes: encrypted, secret: chosen === 'identity' ? { identity: value } : { passphrase: value } });
      if (version !== epoch) return;
      files = unpackFolder(plain); secret.value = ''; key.value = ''; box.remove();
      showContents(); armLock(); notify('Folder unlocked locally. Lock it when you are finished.');
    } finally { value = ''; if (plain) plain.fill(0); }
  }, 'primary'));
  main.append(box); security(main);
  clear.push(() => { encrypted.fill(0); secret.value = ''; key.value = ''; });
}
function showContents(): void {
  const pane = card('Private folder contents'); const toolbar = el('div', '', 'toolbar');
  toolbar.append(el('span', files.length + ' PRIVATE FILES', 'badge'), button('Lock folder', async () => { await render(); }), button('Download plaintext folder ZIP', () => {
    const entries: Record<string, Uint8Array> = Object.create(null);
    for (const file of files) entries[file.path] = file.bytes;
    download('decrypted-folder.zip', zipSync(entries, { level: 0 }), 'application/zip');
    notify('A plaintext ZIP was downloaded. Its contents are outside GitVault protection.');
  })); pane.append(toolbar);
  const breadcrumbs = el('nav', '', 'breadcrumbs'); const list = el('div', '', 'file-list'); const document = el('section', '', 'card'); document.hidden = true; pane.append(breadcrumbs, list); main.append(pane, document);
  const previewFile = (file: FolderFile) => {
    document.hidden = false; document.replaceChildren(el('h2', file.path), button('Download this plaintext file', () => { download(file.path.split('/').at(-1)!, file.bytes); notify('A plaintext copy was downloaded outside GitVault protection.'); }));
    let text: string | undefined;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); if (text.includes('\0')) text = undefined; } catch { /* Binary files are download-only. */ }
    if (text === undefined) document.append(el('p', 'Binary file. Download to open it with the appropriate application.'));
    else { const preview = el('article', '', 'markdown'); renderMarkdown(preview, text); document.append(preview); }
  };
  const navigate = (directory: string) => {
    list.replaceChildren(); document.replaceChildren(); document.hidden = true; breadcrumbs.replaceChildren(button('Private folder', () => navigate('')));
    let cursor = '';
    for (const part of directory.split('/').filter(Boolean)) { cursor += (cursor ? '/' : '') + part; const next = cursor; breadcrumbs.append(el('span', '/'), button(part, () => navigate(next))); }
    const prefix = directory ? directory + '/' : ''; const folders = new Set<string>(); const direct: FolderFile[] = [];
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue;
      const relative = file.path.slice(prefix.length);
      if (relative.includes('/')) folders.add(relative.split('/')[0]); else direct.push(file);
    }
    for (const name of [...folders].sort()) {
      const row = button(name, () => navigate(prefix + name), 'file-row'); row.prepend(el('span', '/', 'file-icon')); list.append(row);
    }
    for (const file of direct.sort((a, b) => a.path.localeCompare(b.path))) {
      const row = button(file.path.split('/').at(-1)!, () => previewFile(file), 'file-row'); row.prepend(el('span', '-', 'file-icon')); list.append(row);
    }
  };
  navigate(''); clear.push(() => { document.replaceChildren(); list.replaceChildren(); });
}
async function render(): Promise<void> {
  layout(); const version = epoch; const params = new URLSearchParams(location.hash.slice(1));
  try {
    if (!isSecureContext) throw new Error('Use HTTPS or localhost');
    if (params.get('mode') === 'encrypt') createScreen();
    else if (params.get('repo') && params.get('file')) {
      notify('Fetching encrypted folder from GitHub...');
      const data = await fetchBytes(params.get('repo')!, params.get('file')!, params.get('ref') || '', controller.signal);
      if (version !== epoch) return; notify(''); unlock(params.get('file')!.split('/').at(-1)!, data);
    } else picker();
  } catch (error) { if (version === epoch) notify(error instanceof Error ? error.message : 'Could not open folder', true); }
}
window.addEventListener('hashchange', () => { void render(); });
window.addEventListener('pagehide', cleanup);
window.addEventListener('pageshow', event => { if (event.persisted) void render(); });
for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => { if (files.length) armLock(); }, { passive: true });
void render();
