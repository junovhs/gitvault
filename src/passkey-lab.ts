import { passkeysAvailable, createPasskey, createRecoveryKey, encryptWithPasskey } from './passkeys.js';
import { runCrypto } from './crypto-client.js';
import { createBundle } from './bundle.js';
import { safeRelative, viewerUrl } from './locator.js';

type UI = { notify: (message: string, error?: boolean) => void; isCurrent: () => boolean; onCleanup: (fn: () => void) => void };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
}
function download(name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
  const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function field(parent: HTMLElement, text: string, type = 'text', value = ''): HTMLInputElement {
  const label = el('label', text, 'field'); const input = el('input'); input.type = type; input.value = value; input.autocomplete = 'off'; input.spellcheck = false; label.append(input); parent.append(label); return input;
}

/** Deliberately separate lab: never silently changes existing password-only files. */
export function renderPasskeyLab(parent: HTMLElement, ui: UI): void {
  let hint: string | undefined;
  let recovery: { identity: string; recipient: string } | undefined;
  let downloaded = false;
  let encrypted: Uint8Array | undefined;
  const button = (text: string, fn: () => void | Promise<void>, className = 'secondary') => {
    const b = el('button', text, className); b.type = 'button';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await fn(); } catch (error) { if (ui.isCurrent()) ui.notify(error instanceof Error ? error.message : 'Passkey operation failed', true); }
      finally { if (b.isConnected) b.disabled = false; }
    });
    return b;
  };
  const intro = el('div', '', 'demo-note');
  intro.append(el('strong', 'Experimental: test documents only'), el('p', 'This uses WebAuthn PRF, not ordinary passkey login. Support depends on your browser, device and passkey provider. A recovery key is required before encryption.'), el('p', 'Passkeys are bound to this hostname: ' + location.hostname + '. They are not scoped to a repository or URL path. Use a trusted host.'));
  parent.append(intro);
  if (!passkeysAvailable()) { parent.append(el('p', 'This browser does not expose the required passkey APIs. Password and age-identity modes remain available.', 'security-note')); return; }
  const grid = el('div', '', 'encrypt-grid'); const setup = el('section', '', 'card'); const publish = el('section', '', 'card');
  setup.append(el('h2', '1. Create a passkey'));
  const passkeyStatus = el('p', 'No passkey selected in this session.', 'small muted');
  setup.append(button('Create encryption passkey', async () => {
    ui.notify('Approve passkey creation in your browser or device prompt.');
    const created = await createPasskey(); if (!ui.isCurrent()) return;
    hint = created; passkeyStatus.textContent = 'Passkey ready. PRF support was confirmed during creation.'; ui.notify('Passkey created. Now save an independent recovery key.');
  }, 'primary'), passkeyStatus);
  setup.append(el('h2', '2. Save a separate recovery key'), el('p', 'This recovery identity can decrypt the file without your phone, passkey provider or this website hostname. Never upload it to your public repository.', 'small muted'));
  const recoveryStatus = el('p', 'No recovery key generated.', 'small muted');
  const acknowledge = el('input'); acknowledge.type = 'checkbox'; acknowledge.disabled = true;
  const acknowledgement = el('label', '', 'check-label'); acknowledgement.append(acknowledge, document.createTextNode('I saved the recovery key outside my public repository.'));
  const saveRecovery = button('Download recovery key', () => {
    if (!recovery) throw new Error('Generate a recovery key first.');
    download('gitvault-recovery-key.txt', new TextEncoder().encode('# GitVault recovery identity: KEEP PRIVATE\n# Public recipient: ' + recovery.recipient + '\n' + recovery.identity + '\n'));
    downloaded = true; acknowledge.disabled = false;
    recoveryStatus.textContent = 'Recovery download requested. Confirm you saved it safely before continuing.';
  }); saveRecovery.disabled = true;
  setup.append(button('Generate recovery key', async () => {
    const created = await createRecoveryKey(); if (!ui.isCurrent()) return;
    recovery = created; downloaded = false; acknowledge.checked = false; acknowledge.disabled = true; saveRecovery.disabled = false;
    recoveryStatus.textContent = 'Recovery key generated locally. Download it separately.';
    results.replaceChildren(); if (encrypted) encrypted.fill(0); encrypted = undefined;
  }), saveRecovery, recoveryStatus, acknowledgement);
  publish.append(el('h2', '3. Encrypt with both unlock routes'));
  const file = field(publish, 'Document for passkey encryption', 'file');
  const repo = field(publish, 'Public repository for bundle (optional)'); repo.placeholder = 'owner/repository';
  const output = field(publish, 'Bundle folder', 'text', 'private');
  publish.append(el('p', 'Leave the repository blank for an encrypted file only. A bundle uses this viewer URL and contains no recovery key.', 'small muted'));
  const results = el('section', '', 'results');
  publish.append(button('Encrypt with passkey + recovery', async () => {
    if (!hint || !recovery || !downloaded || !acknowledge.checked) throw new Error('Create a passkey, download the recovery key, and confirm that you saved it.');
    const selected = file.files?.[0]; if (!selected) throw new Error('Choose a document first.');
    if (selected.size > 16 * 1024 * 1024) throw new Error('Prototype limit: 16 MiB per file');
    safeRelative(selected.name);
    const viewer = new URL(location.pathname, location.origin).href;
    if (repo.value.trim()) viewerUrl(viewer, repo.value.trim(), safeRelative(output.value) + '/' + selected.name + '.age');
    const selectedRecovery = recovery; const selectedHint = hint;
    const plain = new Uint8Array(await selected.arrayBuffer());
    let candidate: Uint8Array | undefined;
    try {
      ui.notify('Approve your passkey to encrypt. The recovery route will then be verified locally.');
      candidate = await encryptWithPasskey(plain, selectedHint, selectedRecovery.recipient);
      if (!ui.isCurrent()) return;
      const verified = await runCrypto({ kind: 'decrypt', bytes: candidate, secret: { identity: selectedRecovery.identity } });
      try { if (verified.length !== plain.length || !verified.every((byte, i) => byte === plain[i])) throw new Error('Recovery verification failed. No download will be offered.'); }
      finally { verified.fill(0); }
      if (!ui.isCurrent()) return;
      encrypted = candidate; candidate = undefined;
      const bytes = encrypted;
      results.replaceChildren(el('p', 'Encrypted. The independent recovery key successfully decrypted a verification copy.', 'success-message'));
      results.append(button('Download passkey-encrypted file', () => download(selected.name + '.age', bytes), 'primary'));
      if (repo.value.trim()) {
        const packaged = await createBundle(bytes, { repo: repo.value.trim(), output: output.value, name: selected.name, viewer });
        if (!ui.isCurrent()) return;
        results.append(button('Download passkey GitHub bundle', () => download(selected.name + '.gitvault.zip', packaged.zip)));
      }
      results.append(el('p', 'Later, choose Passkey (experimental) in the viewer, or choose Private age identity and use your recovery key. The key itself is never included in either download.', 'small muted'));
      ui.notify('Passkey encryption and independent recovery verification completed.');
    } finally { plain.fill(0); if (candidate) candidate.fill(0); }
  }, 'primary full'));
  grid.append(setup, publish); parent.append(grid, results);
  ui.onCleanup(() => { hint = undefined; recovery = undefined; downloaded = false; file.value = ''; if (encrypted) encrypted.fill(0); encrypted = undefined; });
}
