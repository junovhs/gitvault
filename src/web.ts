import { fetchBytes, fetchDirectory, MAX_DOWNLOAD } from './github.js';
import { runCrypto, cancelCrypto } from './crypto-client.js';
import { renderMarkdown } from './markdown.js';
import { safeRelative, validRepo, viewerUrl } from './locator.js';
import { createBundle } from './bundle.js';
import { decryptWithPasskey } from './passkeys.js';
import { renderPasskeyLab } from './passkey-lab.js';
import { workspaceItem } from './workspace.js';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const DEMO_PASSWORD = 'gitvault-demo-not-a-secret';
const MAX_PLAIN = 16 * 1024 * 1024;
let generation = 0;
let aborter = new AbortController();
let cleaners: Array<() => void> = [];
let status: HTMLParagraphElement;
let main: HTMLElement;
let currentPlain: Uint8Array | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

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
function action(label: string, fn: () => void | Promise<void>, className = ''): HTMLButtonElement {
  const b = el('button', label, className); b.type = 'button';
  b.addEventListener('click', async () => {
    const version = generation;
    b.disabled = true;
    try { await fn(); } catch (error) { if (version === generation) notify(error instanceof Error ? error.message : 'Something went wrong.', true); }
    finally { if (b.isConnected) b.disabled = false; }
  });
  return b;
}
function input(parent: HTMLElement, title: string, options: { type?: string; placeholder?: string; value?: string; autocomplete?: string } = {}): HTMLInputElement {
  const label = el('label', title, 'field');
  const field = el('input'); field.type = options.type || 'text'; field.placeholder = options.placeholder || ''; field.value = options.value || '';
  field.autocomplete = (options.autocomplete || 'off') as AutoFill; field.spellcheck = false;
  label.append(field); parent.append(label); return field;
}
function select(parent: HTMLElement, title: string, items: Array<[string, string]>): HTMLSelectElement {
  const label = el('label', title, 'field'); const field = el('select');
  for (const [value, text] of items) { const option = el('option', text); option.value = value; field.append(option); }
  label.append(field); parent.append(label); return field;
}
function card(title: string, description?: string): HTMLElement {
  const section = el('section', '', 'card'); section.append(el('h2', title));
  if (description) section.append(el('p', description, 'muted')); return section;
}
function heading(kicker: string, title: string, description: string): void {
  const header = el('header', '', 'page-heading'); header.append(el('p', kicker, 'eyebrow'), el('h1', title), el('p', description, 'lead')); main.append(header);
  document.title = title + ' | GitVault';
}
function size(bytes: number): string { return bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB'; }
function download(name: string, bytes: Uint8Array, mime = 'application/octet-stream'): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime }));
  const a = link('', url); a.download = name.replace(/[\\/\x00-\x1f]/g, '_'); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearPrivate(): void {
  cancelCrypto();
  if (currentPlain) currentPlain.fill(0);
  currentPlain = null;
  clearTimeout(idleTimer);
  for (const cleanup of cleaners.splice(0)) cleanup();
}
function shell(active: string): void {
  clearPrivate(); aborter.abort(); aborter = new AbortController(); generation++;
  app.replaceChildren();
  const top = el('div', '', 'topbar'); const inside = el('div', '', 'topbar-inner');
  const brand = link('GitVault', '#', 'brand'); brand.prepend(el('span', 'G', 'brand-mark'));
  const nav = el('nav', '', 'nav'); nav.setAttribute('aria-label', 'Main navigation');
  // Three clear choices; specialized tools and technical detail live under More.
  for (const [text, page] of [['Workspace', ''], ['Add a file', 'encrypt'], ['More', 'more']]) {
    const a = link(text, page ? route({ page }) : '#');
    if (page === active || (page === 'more' && ['open', 'about', 'passkeys'].includes(active))) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  inside.append(brand, nav); top.append(inside); app.append(top);
  main = el('main', '', 'main'); main.id = 'main'; app.append(main);
  status = el('p', '', 'status'); status.setAttribute('aria-live', 'polite'); main.append(status);
  const footer = el('footer', '', 'footer');
  footer.append(el('span', 'No account. No tracking. No server-side decryption.'), link('Source & security model', 'https://github.com/junovhs/gitvault'));
  app.append(footer);
}
function rememberCleanup(fn: () => void): void { cleaners.push(fn); }
function armAutoLock(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (currentPlain) void render(); }, 5 * 60 * 1000);
}
function securityNote(parent: HTMLElement): void {
  parent.append(el('p', 'Early, unaudited software. Use test documents, not production credentials or irreplaceable secrets.', 'security-note'));
}
function chooseLocal(parent: HTMLElement): void {
  const file = input(parent, 'Choose an encrypted .age file', { type: 'file' }); file.accept = '.age,.txt,application/octet-stream';
  parent.append(action('Open on this device', async () => {
    const selected = file.files?.[0]; if (!selected) throw new Error('Choose an encrypted file first.');
    if (selected.size > MAX_DOWNLOAD) throw new Error('Prototype limit: 24 MiB per encrypted file.');
    const version = generation; const bytes = new Uint8Array(await selected.arrayBuffer());
    if (version !== generation) return;
    shell('open'); await showEncrypted(selected.name, bytes);
  }, 'primary'));
}
function home(): void {
  heading('PUBLIC PROJECTS. PRIVATE THINKING.', 'Your repo has a private side.', 'Keep your private notes and public code together. Open a project or add an encrypted file, without creating an account.');
  const grid = el('div', '', 'hero-grid');
  const browser = card('Open a project', 'Browse a public GitHub repository and unlock encrypted documents when you need them.');
  const repo = input(browser, 'GitHub repository', { placeholder: 'owner/repository' });
  const ref = input(browser, 'Branch or commit (optional)', { placeholder: 'Uses the repository default branch' });
  const go = () => { const value = repo.value.trim(); if (!validRepo(value)) throw new Error('Enter a repository as owner/name.'); location.hash = route({ repo: value, ...(ref.value ? { ref: ref.value } : {}) }); };
  browser.append(action('Open project', go, 'primary full'));
  repo.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); try { go(); } catch (e) { notify((e as Error).message, true); } } });
  browser.append(link('Try the public demo', route({ repo: 'junovhs/gitvault', file: 'examples/private/welcome.md.age', ref: 'main', demo: '1' }), 'text-link'));
  const start = card('Your files, your keys', 'Use an existing encrypted file or create one to publish beside your project.');
  const homeActions = el('div', '', 'tool-links');
  homeActions.append(link('Add a private file', route({ page: 'encrypt' }), 'button-link'));
  homeActions.append(link('Open a saved encrypted file', route({ page: 'open' }), 'text-link'));
  start.append(homeActions);
  grid.append(browser, start); main.append(grid);
  main.append(el('p', 'GitVault reads public repository files from GitHub. It does not discover your repositories, store passwords, or automatically commit changes.', 'small muted'));
  securityNote(main);
}
function crumbs(repo: string, dir: string, ref: string): HTMLElement {
  const row = el('nav', '', 'breadcrumbs'); row.setAttribute('aria-label', 'Repository path'); row.append(link(repo, route({ repo, ref })));
  let current = '';
  for (const part of dir.split('/').filter(Boolean)) { current += (current ? '/' : '') + part; row.append(el('span', '/'), link(part, route({ repo, ref, dir: current }))); }
  return row;
}
async function browse(repo: string, dir: string, ref: string): Promise<void> {
  if (!validRepo(repo)) throw new Error('Enter a repository as owner/name.'); if (dir) safeRelative(dir);
  heading('PROJECT WORKSPACE', repo, 'Public code and locked documents together. Open a private folder to reveal its contents only after unlocking.');
  main.append(crumbs(repo, dir, ref));
  const version = generation; notify('Loading repository files...');
  const entries = await fetchDirectory(repo, dir, ref, aborter.signal); if (version !== generation) return;
  notify('');
  const pane = card(dir || 'Repository root');
  const toolbar = el('div', '', 'toolbar');
  const filter = input(toolbar, 'Filter files', { placeholder: 'Find a file in this folder' });
  const generatedLabel = el('label', '', 'check-label'); const generated = el('input'); generated.type = 'checkbox'; generatedLabel.append(generated, document.createTextNode('Show generated files')); toolbar.append(generatedLabel);
  toolbar.append(link('Add a private file to this project', route({ page: 'encrypt', repo, ...(ref ? { ref } : {}) }), 'text-link'));
  pane.append(toolbar);
  const list = el('div', '', 'file-list'); pane.append(list);
  const paint = () => {
    list.replaceChildren();
    const paths = new Set(entries.map(e => e.path));
    const displayed = entries.filter(e => {
      if (!e.name.toLowerCase().includes(filter.value.toLowerCase())) return false;
      if (generated.checked) return true;
      return !e.name.endsWith('.qr.svg') && e.name !== '.gitvault-manifest.json' && !(e.type === 'file' && (paths.has(e.path + '.age') || (e.path.endsWith('.md') && paths.has(e.path.slice(0, -3) + '.age'))));
    }).sort((a, b) => Number(b.type === 'dir') - Number(a.type === 'dir') || a.name.localeCompare(b.name));
    for (const entry of displayed) {
      if (entry.type !== 'file' && entry.type !== 'dir') continue;
      const item = workspaceItem(repo, ref, entry, generated.checked);
      const a = link('', item.href, 'file-row');
      a.append(el('span', item.isFolder ? '/' : item.locked ? '#' : '-', 'file-icon' + (item.locked ? ' locked' : '')));
      const copy = el('span', '', 'file-copy');
      copy.append(el('strong', item.label), el('span', item.detail));
      a.append(copy, el('span', item.action || size(entry.size), item.locked ? 'badge' : 'muted'));
      list.append(a);
    }
    if (!list.childElementCount) list.append(el('p', 'No matching files in this folder.', 'empty'));
  };
  filter.addEventListener('input', paint); generated.addEventListener('change', paint); paint(); main.append(pane);
  main.append(el('p', 'This browser reads public GitHub data without a token. It does not clone, modify, or upload to the repository.', 'muted small'));
}
async function showRemote(repo: string, file: string, ref: string, demo: boolean): Promise<void> {
  safeRelative(file); if (!validRepo(repo)) throw new Error('Invalid repository');
  main.append(crumbs(repo, file.split('/').slice(0, -1).join('/'), ref));
  notify('Fetching ' + file + ' from GitHub...'); const version = generation;
  const bytes = await fetchBytes(repo, file, ref, aborter.signal); if (version !== generation) return;
  notify('');
  if (file.endsWith('.age')) await showEncrypted(file.split('/').at(-1)!, bytes, { repo, file, ref, demo });
  else { heading('PUBLIC FILE', file.split('/').at(-1)!, 'Public content from GitHub. Nothing on this screen needed decryption.'); documentView(file.split('/').at(-1)!, bytes, false); }
}
type Remote = { repo: string; file: string; ref: string; demo: boolean };
async function showEncrypted(name: string, encrypted: Uint8Array, remote?: Remote): Promise<void> {
  heading('ENCRYPTED DOCUMENT', name.replace(/\.age$/, ''), 'The file is public. What is inside is not.');
  const grid = el('div', '', 'unlock-grid');
  const box = card('Unlock on this device', 'Use the method configured when the file was encrypted. Secrets stay on this device.');
  box.prepend(el('div', '#', 'lock-symbol'));
  const method = select(box, 'Unlock method', [['passphrase', 'Password'], ['identity', 'Private age identity'], ['passkey', 'Passkey (experimental)']]);
  const secret = input(box, 'Password or private identity', { type: 'password', autocomplete: 'current-password' });
  const keyFile = input(box, 'Or choose an identity file', { type: 'file' }); keyFile.accept = '.txt,.key'; keyFile.parentElement!.hidden = true;
  const show = el('label', '', 'check-label'); const visible = el('input'); visible.type = 'checkbox'; show.append(visible, document.createTextNode('Show secret')); visible.addEventListener('change', () => { secret.type = visible.checked ? 'text' : 'password'; }); box.append(show);
  const hint = el('p', 'Approve the compatible passkey originally used to encrypt this file. A normal sign-in passkey cannot unlock an unrelated file.', 'small muted'); hint.hidden = true; box.append(hint);
  const updateMethod = () => {
    const passkey = method.value === 'passkey';
    keyFile.parentElement!.hidden = method.value !== 'identity'; secret.parentElement!.hidden = passkey; show.hidden = passkey; hint.hidden = !passkey;
    secret.value = ''; keyFile.value = ''; visible.checked = false; secret.type = 'password';
  };
  method.addEventListener('change', updateMethod);
  if (remote?.demo) {
    const banner = el('div', '', 'demo-note'); banner.append(el('strong', 'Public demonstration'), el('p', 'This sample is intentionally not secret. Its password is:'), el('code', DEMO_PASSWORD), action('Use demo password', () => { method.value = 'passphrase'; updateMethod(); secret.value = DEMO_PASSWORD; })); box.append(banner);
  }
  const version = generation;
  box.append(action('Unlock document', async () => {
    const chosen = method.value;
    notify(chosen === 'passkey' ? 'Approve your encryption passkey in the device prompt.' : 'Unlocking locally. Password derivation can take a moment...');
    let value = secret.value;
    if (chosen === 'identity' && keyFile.files?.[0]) { if (keyFile.files[0].size > 16384) throw new Error('Identity file is unexpectedly large'); value = await keyFile.files[0].text(); }
    if (chosen !== 'passkey' && !value) throw new Error('Enter the password or select a private identity.');
    if (version !== generation) return;
    try {
      const bytes = chosen === 'passkey'
        ? await decryptWithPasskey(encrypted)
        : await runCrypto({ kind: 'decrypt', bytes: encrypted, secret: chosen === 'identity' ? { identity: value } : { passphrase: value } });
      if (version !== generation) { bytes.fill(0); return; }
      secret.value = ''; keyFile.value = ''; value = '';
      grid.remove(); currentPlain = bytes; armAutoLock();
      notify('Unlocked on this device. Lock when you are finished.');
      documentView(name.replace(/\.age$/, ''), bytes, true);
    } finally { value = ''; }
  }, 'primary full'));
  const info = card('A key, not an account.', 'GitVault cannot reset your password or recover a lost identity. Keep a secure backup.');
  info.append(el('h3', 'On your phone?'), el('p', 'Scanning a landing-page QR opens this viewer on your phone. You still need the configured unlock method.'), el('h3', 'Passkeys are experimental'), el('p', 'Passkey-encrypted files need a compatible WebAuthn PRF credential on the same trusted hostname. The passkey lab also adds a separate recovery identity. Phone-to-desktop approval is not a custom feature in this build.'), link('Explore the passkey lab', route({ page: 'passkeys' })), el('p', 'For recovery, choose Private age identity and select your recovery key file.', 'small muted'));
  grid.append(box, info); main.append(grid);
  const lower = el('div', '', 'toolbar'); lower.append(action('Download encrypted file', () => download(name, encrypted), 'secondary'));
  if (remote) lower.append(link('Browse this repository', route({ repo: remote.repo, ref: remote.ref }), 'button-link'));
  main.append(lower); securityNote(main);
  rememberCleanup(() => { secret.value = ''; keyFile.value = ''; encrypted.fill(0); });
}
function documentView(name: string, bytes: Uint8Array, privateFile: boolean): void {
  const panel = card(privateFile ? 'Unlocked document' : 'File preview'); panel.classList.add('document-panel');
  const toolbar = el('div', '', 'toolbar');
  toolbar.append(el('span', privateFile ? 'LOCAL DECRYPTION' : 'PUBLIC FILE', 'badge'));
  toolbar.append(action(privateFile ? 'Download plaintext' : 'Download file', () => { download(name, bytes); if (privateFile) notify('A plaintext copy was downloaded. It is outside GitVault protection.'); }, 'secondary'));
  if (privateFile) toolbar.append(action('Lock now', async () => { await render(); }, 'secondary'));
  panel.append(toolbar);
  let content: string | null;
  try { content = decoder.decode(bytes); if (content.includes('\0')) content = null; } catch { content = null; }
  if (content === null) { panel.append(el('p', 'This is a binary file. Download it to open in the appropriate application.')); main.append(panel); return; }
  const tabs = el('div', '', 'tabs'); const preview = el('article', '', 'markdown'); const source = el('pre', '', 'source'); source.hidden = true;
  const editor = el('textarea', '', 'editor'); editor.setAttribute('aria-label', 'Edit decrypted document'); editor.spellcheck = false; editor.hidden = true;
  renderMarkdown(preview, content); source.textContent = content.slice(0, 256000); editor.value = content;
  const setTab = (target: 'preview' | 'source' | 'edit') => {
    preview.hidden = target !== 'preview'; source.hidden = target !== 'source'; editor.hidden = target !== 'edit';
    if (target === 'preview') renderMarkdown(preview, editor.value);
    if (target === 'source') source.textContent = editor.value.slice(0, 256000);
  };
  tabs.append(action('Preview', () => setTab('preview'), 'tab'), action('Source', () => setTab('source'), 'tab'));
  if (privateFile) {
    tabs.append(action('Edit', () => setTab('edit'), 'tab'));
    panel.append(action('Encrypt edited copy', async () => {
      const draft = new File([encoder.encode(editor.value)], name, { type: 'application/octet-stream' });
      shell('encrypt'); encryptScreen(draft);
    }, 'primary'), el('p', 'Editing is local only. Saving opens encryption settings for a new encrypted copy; it never commits plaintext or uploads changes. Choose the new unlock method explicitly.', 'small muted'));
  }
  panel.append(tabs, preview, source, editor, el('p', 'Privacy-safe preview: HTML, images and external links are not activated.', 'small muted'));
  main.append(panel);
  rememberCleanup(() => { editor.value = ''; source.textContent = ''; preview.replaceChildren(); content = null; });
}
function encryptScreen(initial?: File): void {
  heading('ADD SOMETHING PRIVATE', 'Start with a note or file.', 'Create something here or select a file. Encryption runs on this device; publishing remains an explicit download and Git commit.');
  const project = new URLSearchParams(location.hash.slice(1));
  const projectRepo = project.get('page') === 'encrypt' && validRepo(project.get('repo') || '') ? project.get('repo')! : '';
  const folderHref = './folder.html#' + new URLSearchParams({ mode: 'encrypt', ...(projectRepo ? { repo: projectRepo } : {}) }).toString();
  const alternative = el('div', '', 'alternative-action');
  alternative.append(link('Add a private folder instead', folderHref, 'text-link'));
  main.append(alternative);
  const grid = el('div', '', 'encrypt-grid');
  const form = card('Your private content');
  const sourceTabs = el('div', '', 'tabs');
  form.append(sourceTabs);
  const file = input(form, 'Original document', { type: 'file' });
  const noteFields = el('div', '', 'note-fields');
  const noteName = input(noteFields, 'Note filename (public if individually published)', { value: 'private-note.md' });
  const noteLabel = el('label', 'Write your note', 'field');
  const note = el('textarea', '', 'editor note-editor'); note.setAttribute('aria-label', 'Private note'); note.spellcheck = true;
  noteLabel.append(note); noteFields.append(noteLabel);
  noteFields.append(el('p', 'This draft is not saved. Leaving the page discards it. For sensitive filenames, use a concealed folder instead.', 'small muted'));
  form.append(noteFields);
  let sourceMode: 'file' | 'note' = 'file';
  const fileButton = action('Choose a file', () => setSource('file'), 'tab');
  const noteButton = action('Write a note', () => setSource('note'), 'tab');
  function setSource(mode: 'file' | 'note'): void {
    sourceMode = mode;
    file.parentElement!.hidden = mode !== 'file'; noteFields.hidden = mode !== 'note';
    fileButton.setAttribute('aria-pressed', String(mode === 'file'));
    noteButton.setAttribute('aria-pressed', String(mode === 'note'));
  }
  sourceTabs.append(fileButton, noteButton);
  setSource('file');
  if (initial) form.append(el('p', 'Using your edited copy: ' + initial.name, 'demo-note'));
  const method = select(form, 'Encryption method', [['passphrase', 'A password you remember'], ['recipient', 'An age public recipient']]);
  const secret = input(form, 'Password', { type: 'password', placeholder: 'A long, unique passphrase', autocomplete: 'new-password' });
  const confirm = input(form, 'Confirm password', { type: 'password', autocomplete: 'new-password' });
  method.addEventListener('change', () => {
    const recipientMode = method.value === 'recipient';
    secret.parentElement!.firstChild!.textContent = recipientMode ? 'Public age recipient' : 'Password';
    secret.type = recipientMode ? 'text' : 'password';
    confirm.parentElement!.hidden = recipientMode;
    secret.placeholder = recipientMode ? 'age1... public recipient (never a private identity)' : 'A long, unique passphrase';
    secret.value = ''; confirm.value = '';
  });
  form.append(el('p', 'Public ciphertext can be guessed against offline. Use a unique, randomly generated passphrase, not a reused login password.', 'small muted'));
  const settings = el('details', '', 'card publish-options');
  settings.append(el('summary', 'Publish to GitHub (optional)', 'publish-summary'));
  settings.append(el('p', 'Generate a GitHub-ready bundle containing only ciphertext and public landing assets.', 'muted'));
  const initialRepo = projectRepo;
  const repo = input(settings, 'Public repository', { placeholder: 'owner/repository', value: initialRepo });
  if (initialRepo) settings.open = true;
  const output = input(settings, 'Generated folder in the repo', { value: 'private' });
  const ref = input(settings, 'Branch or commit (optional)', { placeholder: 'Repository default', value: initialRepo ? project.get('ref') || '' : '' });
  const viewer = input(settings, 'Trusted viewer URL', { value: new URL(location.pathname, location.origin).href });
  settings.append(el('p', 'The ZIP contains only the encrypted file, its public Markdown landing page, and a QR image. Extract it into your repo and commit those files.', 'small muted'));
  const results = el('section', '', 'results');
  const version = generation;
  const perform = async (bundle: boolean) => {
    const selected = sourceMode === 'note' ? (() => {
      if (!note.value.trim()) throw new Error('Write a note before encrypting.');
      const candidate = noteName.value.trim();
      if (!candidate) throw new Error('Give your note a filename.');
      const name = candidate.endsWith('.md') ? candidate : candidate + '.md';
      safeRelative(name);
      return new File([encoder.encode(note.value)], name, { type: 'text/markdown' });
    })() : file.files?.[0] || initial;
    if (!selected) throw new Error('Choose a document first.');
    safeRelative(selected.name);
    if (selected.size > MAX_PLAIN) throw new Error('Prototype limit: 16 MiB per original file.');
    if (method.value === 'passphrase' && (secret.value.length < 16 || secret.value !== confirm.value)) throw new Error('Use at least 16 characters and enter the same password twice.');
    if (method.value === 'recipient' && !secret.value.trim().startsWith('age1')) throw new Error('Enter a public age recipient beginning age1.');
    const options = { repo: repo.value.trim(), output: output.value, name: selected.name, viewer: viewer.value, ref: ref.value || undefined };
    if (bundle) viewerUrl(options.viewer, options.repo, safeRelative(options.output) + '/' + selected.name + '.age', options.ref);
    const mode = method.value; let entered = secret.value;
    notify('Encrypting locally. Your file is not being uploaded...');
    const plain = new Uint8Array(await selected.arrayBuffer());
    let encrypted: Uint8Array;
    try {
      if (version !== generation) return;
      encrypted = await runCrypto({ kind: 'encrypt', bytes: plain, secret: mode === 'recipient' ? { recipient: entered.trim() } : { passphrase: entered } });
    } finally { plain.fill(0); entered = ''; }
    if (version !== generation) { encrypted.fill(0); return; }
    results.replaceChildren(el('p', 'Encrypted successfully. No plaintext was uploaded.', 'success-message'));
    if (bundle) {
      const packaged = await createBundle(encrypted, options);
      if (version !== generation) return;
      results.append(action('Download GitHub bundle (.zip)', () => download(selected.name + '.gitvault.zip', packaged.zip, 'application/zip'), 'primary'));
      const details = el('details'); details.append(el('summary', 'Preview the generated landing page'), el('pre', packaged.landing)); results.append(details);
      results.append(el('p', 'After committing the bundle to the configured repository:'), link('Open its viewer link', packaged.url, 'text-link'));
    }
    results.append(action('Download encrypted file (.age)', () => download(selected.name + '.age', encrypted), 'secondary'));
    results.append(el('p', 'Do not add the original document or password to your public repository.', 'security-note'));
    secret.value = ''; confirm.value = ''; notify('Ready to download. Only encrypted/public artifacts are in the bundle.');
  };
  const buttons = el('div', '', 'toolbar'); buttons.append(action('Encrypt file', () => perform(false), 'primary'));
  form.append(buttons);
  settings.append(action('Encrypt + create GitHub bundle', () => perform(true), 'secondary'));
  grid.append(form, settings); main.append(grid, results); securityNote(main);
  rememberCleanup(() => { secret.value = ''; confirm.value = ''; file.value = ''; note.value = ''; noteName.value = ''; initial = undefined; });
}
function more(): void {
  heading('TOOLS & DETAILS', 'More, when you need it.', 'The everyday experience is files and folders. These tools are here when you need more control.');
  const grid = el('div', '', 'hero-grid');
  const files = card('Files and folders', 'Open a downloaded file, or work with an encrypted folder whose internal filenames stay private.');
  const fileLinks = el('div', '', 'tool-links');
  fileLinks.append(link('Open an encrypted file', route({ page: 'open' }), 'text-link'));
  fileLinks.append(link('Open a concealed folder (experimental)', './folder.html', 'text-link'));
  fileLinks.append(link('Create a concealed folder (experimental)', './folder.html#mode=encrypt', 'text-link'));
  files.append(fileLinks);
  const tools = card('Keys and guidance', 'Advanced unlock methods are optional. Keep an independent backup of any recovery key.');
  const toolLinks = el('div', '', 'tool-links');
  toolLinks.append(link('Passkey lab (experimental)', route({ page: 'passkeys' }), 'text-link'));
  toolLinks.append(link('How GitVault works', route({ page: 'about' }), 'text-link'));
  toolLinks.append(link('Security and limitations', 'https://github.com/junovhs/gitvault/blob/main/docs/SECURITY.md', 'text-link'));
  tools.append(toolLinks);
  grid.append(files, tools); main.append(grid); securityNote(main);
}
function about(): void {
  heading('HIDE IN PLAIN SIGHT', 'One repo. Two kinds of files.', 'GitHub stores the locked document. GitVault makes it readable on your device.');
  const article = card('The complete workflow');
  for (const [title, text] of [
    ['Write locally', 'Put private files in .gitvault/plain/, an ignored folder. The CLI config chooses where public encrypted artifacts go.'],
    ['Encrypt before you commit', 'Run GitVault or install its local hook. Only ciphertext, landing pages and QR images belong in the public commit. Encrypting at push time is too late.'],
    ['Find it later on GitHub', 'The generated Markdown page explains that the document is encrypted. Its button and QR link to this viewer. No password is in that link.'],
    ['Unlock without cloning', 'The viewer fetches public ciphertext from GitHub. Use its configured password, private identity, or compatible experimental passkey and read locally.'],
    ['Or clone and work normally', 'Clone the repository, run the CLI decrypt command with your key, and edit the restored files in the ignored workspace. Encrypt again before committing.'],
  ]) { article.append(el('h3', title), el('p', text)); }
  article.append(el('h3', 'What the website does not promise'), el('p', 'GitHub can see filenames, sizes and history. The host and its JavaScript must be trusted. A shared computer or malicious extension can see unlocked content. Losing every key means losing access. Changing a key does not revoke old ciphertext.'), el('h3', 'Phone and passkey boundaries'), el('p', 'A permanent QR opens the viewer on your phone. It is not a login token. The experimental passkey lab uses WebAuthn PRF and requires an independent recovery key. Credential portability depends on your provider. Custom phone-to-desktop pairing is not implemented.'));
  main.append(article); securityNote(main);
}
async function render(): Promise<void> {
  const p = new URLSearchParams(location.hash.length > 1 ? location.hash.slice(1) : location.search);
  const page = p.get('page') || ''; shell(page);
  const version = generation;
  try {
    if (!isSecureContext) throw new Error('Use HTTPS or localhost. Cryptographic operations are not available on an insecure origin.');
    if (page === 'encrypt') encryptScreen();
    else if (page === 'open') { heading('LOCAL FILE', 'Already have the locked file?', 'Open ciphertext from a download, a clone, or your phone. This path makes no GitHub requests.'); const box = card('Open an encrypted file'); chooseLocal(box); main.append(box); securityNote(main); }
    else if (page === 'passkeys') {
      heading('EXPERIMENTAL / WEBAUTHN PRF', 'Your device is a key. Keep a spare.', 'Encrypt using a compatible passkey, with an independently verified recovery identity. No account or server-side key storage.');
      renderPasskeyLab(main, { notify, isCurrent: () => generation === version, onCleanup: rememberCleanup });
      securityNote(main);
    }
    else if (page === 'more') more();
    else if (page === 'about') about();
    else if (p.get('repo') && p.get('file')?.endsWith('.gvfolder.age')) {
      // Preserve older document-viewer links while sending folder containers to their proper viewer.
      const href = './folder.html' + route({ repo: p.get('repo')!, file: p.get('file')!, ...(p.get('ref') ? { ref: p.get('ref')! } : {}) });
      location.replace(href);
    }
    else if (p.get('repo') && p.get('file')) await showRemote(p.get('repo')!, p.get('file')!, p.get('ref') || '', p.get('demo') === '1');
    else if (p.get('repo')) await browse(p.get('repo')!, p.get('dir') || '', p.get('ref') || '');
    else home();
  } catch (e) { if (version === generation && !(e instanceof DOMException && e.name === 'AbortError')) notify(e instanceof Error ? e.message : 'Unable to load this page.', true); }
}
window.addEventListener('hashchange', () => { void render(); });
window.addEventListener('pagehide', clearPrivate);
window.addEventListener('pageshow', event => { if (event.persisted) void render(); });
for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => { if (currentPlain) armAutoLock(); }, { passive: true });
void render();
