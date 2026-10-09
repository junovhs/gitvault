#!/usr/bin/env node
import { writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import QRCode from 'qrcode';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { encrypt, decrypt } from './crypto.js';
import { confined, safeRelative, noSymlinks, atomicWrite, readBounded } from './paths.js';
import { viewerUrl, validRepo, canonicalPath } from './locator.js';
import { landingPage } from './landing.js';
import { passwordPrompt } from './prompt.js';

type Config = { version: 1; repo: string; viewer: string; source: string; output: string; mode: 'passphrase' | 'recipient'; recipient?: string; ref?: string };
type Entry = { source: string; payload: string; landing: string; qr: string };
type Manifest = { gitvault: 1; entries: Entry[] };
const MANIFEST = '.gitvault-manifest.json';
const MAX_FILE = 16 * 1024 * 1024;
const MAX_CIPHERTEXT = 24 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const MAX_FILES = 256;
let root = process.cwd();
function git(...args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }); }
async function exists(file: string): Promise<boolean> { try { await lstat(file); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e; } }
function literal(value: string): string { return ':(literal)' + value; }
function artifactNames(source: string): Entry {
  safeRelative(source);
  return { source, payload: source + '.age', landing: /\.md$/i.test(source) ? source : source + '.md', qr: source + '.qr.svg' };
}
async function loadConfig(): Promise<Config> {
  const cfg: unknown = YAML.parse((await readBounded(root, '.gitvault.yml', 65536)).toString('utf8'), { maxAliasCount: 0 });
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Invalid .gitvault.yml');
  const c = cfg as Config;
  if (c.version !== 1 || typeof c.repo !== 'string' || !validRepo(c.repo) || !['passphrase', 'recipient'].includes(c.mode)) throw new Error('Invalid version, repo or mode in .gitvault.yml');
  safeRelative(c.source); safeRelative(c.output);
  const source = canonicalPath(c.source); const output = canonicalPath(c.output);
  if (source === output || output.startsWith(source + '/') || source.startsWith(output + '/')) throw new Error('Source and output paths cannot overlap, including case/Unicode aliases');
  if (c.output.split('/')[0].startsWith('.')) throw new Error('Output must be a dedicated, non-hidden directory');
  if (c.mode === 'recipient' && (typeof c.recipient !== 'string' || !c.recipient.startsWith('age1'))) throw new Error('Set a public age1 recipient in the config');
  if (c.ref !== undefined && (typeof c.ref !== 'string' || c.ref.length > 1024 || /[\x00-\x1f]/.test(c.ref))) throw new Error('Invalid ref');
  viewerUrl(c.viewer, c.repo, c.output + '/check.age', c.ref);
  await noSymlinks(root, c.source); await noSymlinks(root, c.output);
  return c;
}
async function walk(relative: string, budget = { count: 0 }, depth = 0): Promise<string[]> {
  if (depth > 32) throw new Error('Directory tree exceeds the prototype depth limit');
  await noSymlinks(root, relative);
  const result: string[] = [];
  for (const item of await readdir(confined(root, relative), { withFileTypes: true })) {
    if (++budget.count > 4096) throw new Error('Directory tree exceeds the prototype entry limit');
    const full = relative + '/' + item.name;
    await noSymlinks(root, full);
    if (item.isDirectory()) for (const nested of await walk(full, budget, depth + 1)) result.push(item.name + '/' + nested);
    else if (item.isFile()) result.push(safeRelative(item.name));
    else throw new Error('Only regular files and directories are supported: ' + full);
  }
  return result.sort();
}
function assertIgnored(c: Config, files: string[]): void {
  if (git('ls-files', '-z', '--', literal(c.source))) throw new Error('Tracked plaintext detected under ' + c.source + '. Stop: encryption does not remove it from Git history.');
  for (const relative of [c.source + '/__gitvault_probe__', ...files.map(f => c.source + '/' + f)]) {
    try { git('check-ignore', '--quiet', '--', relative); } catch { throw new Error('Plaintext path is not Git-ignored: ' + relative); }
  }
}
async function readManifest(c: Config): Promise<Manifest | null> {
  const file = c.output + '/' + MANIFEST;
  await noSymlinks(root, file);
  if (!await exists(confined(root, file))) return null;
  const m = JSON.parse((await readBounded(root, file, 512 * 1024)).toString('utf8')) as Manifest;
  if (!m || m.gitvault !== 1 || !Array.isArray(m.entries) || m.entries.length > MAX_FILES) throw new Error('Invalid vault manifest or too many files (limit 256)');
  for (const entry of m.entries) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid manifest entry');
    const expected = artifactNames(entry.source);
    if (entry.payload !== expected.payload || entry.landing !== expected.landing || entry.qr !== expected.qr) throw new Error('Invalid manifest entry');
  }
  assertNoCollisions(m.entries);
  return m;
}
function assertNoCollisions(entries: Entry[]): void {
  const seen = new Set<string>([MANIFEST.toLowerCase()]);
  for (const entry of entries) for (const file of [entry.payload, entry.landing, entry.qr]) {
    const normalized = canonicalPath(safeRelative(file));
    if (seen.has(normalized) || [...seen].some(p => p.startsWith(normalized + '/') || normalized.startsWith(p + '/'))) throw new Error('Generated file collision: ' + file);
    seen.add(normalized);
  }
}
async function outputPreflight(c: Config, entries: Entry[]): Promise<void> {
  assertNoCollisions(entries);
  const previous = await readManifest(c);
  const oldNames = new Set(previous?.entries.flatMap(e => [e.payload, e.landing, e.qr]) || []);
  for (const file of await exists(confined(root, c.output)) ? await walk(c.output) : []) {
    if (file === MANIFEST && previous) continue;
    if (!oldNames.has(file)) throw new Error('Refusing to overwrite an unowned output directory/file: ' + c.output + '/' + file);
  }
  const removed = previous?.entries.filter(e => !entries.some(n => n.source === e.source)) || [];
  if (removed.length) throw new Error('Source files were removed: ' + removed.map(e => e.source).join(', ') + '. Restore them before encrypting. Automatic deletion/pruning is not implemented.');
}
async function passphrase(confirm: boolean): Promise<string> {
  const supplied = process.env.GITVAULT_PASSPHRASE;
  const value = supplied ?? await passwordPrompt('Vault password (hidden): ');
  if (confirm && value.length < 16) throw new Error('Use a unique passphrase of at least 16 characters. Length alone does not guarantee strength.');
  if (confirm && supplied === undefined && value !== await passwordPrompt('Confirm password (hidden): ')) throw new Error('Passwords do not match');
  if (!value) throw new Error('A password is required');
  return value;
}
async function protect(stage: boolean): Promise<void> {
  const c = await loadConfig(); const files = await walk(c.source); assertIgnored(c, files);
  if (files.length > MAX_FILES) throw new Error('Prototype limit: 256 private files per vault');
  const entries = files.map(artifactNames);
  await outputPreflight(c, entries);
  if (!files.length) { console.log('No private files to encrypt.'); return; }
  let total = 0;
  for (const file of files) {
    total += (await lstat(confined(root, c.source + '/' + file))).size;
    if ((await lstat(confined(root, c.source + '/' + file))).size > MAX_FILE || total > MAX_TOTAL) throw new Error('Prototype limit: 16 MiB per file, 64 MiB per operation');
  }
  const secret = c.mode === 'recipient' ? { recipient: c.recipient! } : { passphrase: await passphrase(true) };
  // Prepare every ciphertext and public artifact before modifying the output directory.
  const prepared: Array<[string, string | Uint8Array]> = [];
  total = 0;
  for (const entry of entries) {
    const plain = await readBounded(root, c.source + '/' + entry.source, MAX_FILE);
    try {
      total += plain.length;
      if (total > MAX_TOTAL) throw new Error('Source grew beyond the 64 MiB operation limit');
      prepared.push([c.output + '/' + entry.payload, await encrypt(plain, secret)]);
    } finally { plain.fill(0); }
    const url = viewerUrl(c.viewer, c.repo, c.output + '/' + entry.payload, c.ref);
    prepared.push([c.output + '/' + entry.qr, await QRCode.toString(url, { type: 'svg', margin: 4, width: 256, errorCorrectionLevel: 'M' })]);
    prepared.push([c.output + '/' + entry.landing, landingPage({ name: entry.source, ciphertextFile: c.output + '/' + entry.payload, repo: c.repo, viewer: c.viewer, qrFile: path.posix.basename(entry.qr), ref: c.ref })]);
  }
  for (const [file, bytes] of prepared) await atomicWrite(root, file, bytes);
  await atomicWrite(root, c.output + '/' + MANIFEST, JSON.stringify({ gitvault: 1, entries }, null, 2) + '\n');
  assertIgnored(c, files);
  if (stage) git('add', '--', ...prepared.map(([file]) => literal(file)), literal(c.output + '/' + MANIFEST));
  console.log('Encrypted ' + files.length + ' file(s) into ' + c.output + '/' + (stage ? ' and staged generated artifacts.' : '.'));
  console.log('Plaintext remains only in the ignored workspace. Review git diff --cached before committing.');
}
async function restore(): Promise<void> {
  const c = await loadConfig(); assertIgnored(c, []);
  const manifest = await readManifest(c);
  if (!manifest) throw new Error('No GitVault manifest found. Use the web viewer to unlock individual .age files.');
  let encryptedTotal = 0;
  for (const e of manifest.entries) {
    await noSymlinks(root, c.source + '/' + e.source);
    if (await exists(confined(root, c.source + '/' + e.source))) throw new Error('Refusing to overwrite local file: ' + e.source);
    await noSymlinks(root, c.output + '/' + e.payload);
    const size = (await lstat(confined(root, c.output + '/' + e.payload))).size;
    encryptedTotal += size;
    if (size > MAX_CIPHERTEXT || encryptedTotal > MAX_TOTAL * 1.5) throw new Error('Vault exceeds prototype ciphertext limits');
  }
  let identity = process.env.GITVAULT_IDENTITY;
  if (!identity && process.env.GITVAULT_IDENTITY_FILE) {
    const key = path.resolve(process.env.GITVAULT_IDENTITY_FILE);
    identity = (await readBounded(path.dirname(key), path.basename(key), 16384)).toString('utf8');
  }
  if (identity) identity = identity.split(/\r?\n/).find(line => line.trim().startsWith('AGE-SECRET-KEY-'))?.trim();
  if (c.mode === 'recipient' && !identity) throw new Error('Set GITVAULT_IDENTITY_FILE to your backed-up age key file');
  const secret = identity ? { identity } : { passphrase: await passphrase(false) };
  const prepared: Array<[string, Uint8Array]> = [];
  let plainTotal = 0;
  try {
    for (const e of manifest.entries) {
      const encrypted = await readBounded(root, c.output + '/' + e.payload, MAX_CIPHERTEXT);
      const plain = await decrypt(encrypted, secret);
      plainTotal += plain.length;
      if (plain.length > MAX_FILE || plainTotal > MAX_TOTAL) { plain.fill(0); throw new Error('Vault exceeds prototype plaintext limits'); }
      prepared.push([c.source + '/' + e.source, plain]);
    }
    assertIgnored(c, manifest.entries.map(e => e.source));
    for (const [relative, bytes] of prepared) {
      await noSymlinks(root, relative);
      const dest = confined(root, relative);
      await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
      await writeFile(dest, bytes, { flag: 'wx', mode: 0o600 });
    }
    console.log('Restored ' + prepared.length + ' file(s) into ignored workspace ' + c.source + '/.');
  } finally { for (const [, bytes] of prepared) bytes.fill(0); }
}
async function init(): Promise<void> {
  await noSymlinks(root, '.gitvault.yml'); await noSymlinks(root, '.gitignore'); await noSymlinks(root, '.gitvault/plain');
  if (await exists(path.join(root, '.gitvault.yml'))) throw new Error('.gitvault.yml already exists');
  let repo = 'your-name/your-repo';
  try {
    const remote = git('remote', 'get-url', 'origin').trim().replace(/\.git$/, '');
    const match = remote.match(/github\.com[:/]([^/]+\/[^/]+)$/);
    if (match && validRepo(match[1])) repo = match[1];
  } catch { /* A remote can be added after initialization. */ }
  const previous = await exists(path.join(root, '.gitignore')) ? (await readBounded(root, '.gitignore', 1024 * 1024)).toString('utf8') : '';
  await atomicWrite(root, '.gitignore', previous + (previous.endsWith('\n') || !previous ? '' : '\n') + '\n# GitVault: plaintext and identities never belong in Git\n/.gitvault/plain/\n/.gitvault/keys/\n');
  await mkdir(path.join(root, '.gitvault/plain'), { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, '.gitvault.yml'), YAML.stringify({ version: 1, repo, viewer: 'https://junovhs.github.io/gitvault/', source: '.gitvault/plain', output: 'private', mode: 'passphrase' }), { flag: 'wx' });
  console.log('Initialized. Edit .gitvault.yml, put documents in .gitvault/plain/, then run encrypt.');
}
async function keygen(): Promise<void> {
  const c = await loadConfig(); assertIgnored(c, []);
  const relative = '.gitvault/keys/identity.txt'; await noSymlinks(root, relative);
  try { git('check-ignore', '--quiet', '--', relative); } catch { throw new Error('Key directory must be Git-ignored'); }
  if (git('ls-files', '--', literal('.gitvault/keys'))) throw new Error('Key directory contains tracked files');
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  await mkdir(path.join(root, '.gitvault/keys'), { recursive: true, mode: 0o700 });
  await writeFile(confined(root, relative), '# public recipient: ' + recipient + '\n' + identity + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Private identity saved to ignored ' + relative + '. Back it up securely.');
  console.log('Public recipient: ' + recipient);
  console.log('For key-based encryption, set mode: recipient and recipient: ' + recipient + ' in .gitvault.yml.');
}
function shellQuote(value: string): string { return "'" + value.replaceAll("'", "'\\''") + "'"; }
async function installHook(): Promise<void> {
  await loadConfig();
  try { if (git('config', '--get', 'core.hooksPath').trim()) throw new Error('custom'); }
  catch (e) { if ((e as Error).message === 'custom') throw new Error('Custom core.hooksPath detected. Integrate gitvault encrypt --stage in your existing hook instead.'); }
  const hooks = path.resolve(root, git('rev-parse', '--git-path', 'hooks').trim()); await mkdir(hooks, { recursive: true });
  const cli = fileURLToPath(import.meta.url); const loader = import.meta.resolve('tsx');
  const content = ['#!/bin/sh', 'set -eu', 'cd "$(git rev-parse --show-toplevel)"', [shellQuote(process.execPath), '--import', shellQuote(loader), shellQuote(cli), 'encrypt', '--stage'].join(' '), ''].join('\n');
  await writeFile(path.join(hooks, 'pre-commit'), content, { flag: 'wx', mode: 0o755 });
  console.log('Installed local pre-commit hook. It uses this GitVault installation and respects configured output.');
  console.log('Reinstall on each computer. For noninteractive commits, supply GITVAULT_PASSPHRASE in the environment or use recipient mode.');
}
async function main(): Promise<void> {
  const action = process.argv[2];
  if (!action || ['help', '--help', '-h'].includes(action)) {
    console.log('GitVault: private documents in public repos\n\nCommands: init | encrypt [--stage] | decrypt | keygen | check | hook install\nRun inside your target Git repository. Plaintext must remain in a Git-ignored workspace.');
    return;
  }
  root = await realpath(git('rev-parse', '--show-toplevel').trim());
  if (action === 'init') await init();
  else if (action === 'encrypt') await protect(process.argv.includes('--stage'));
  else if (action === 'decrypt' || action === 'unlock') await restore();
  else if (action === 'keygen') await keygen();
  else if (action === 'hook' && process.argv[3] === 'install') await installHook();
  else if (action === 'check' || action === 'status') { const c = await loadConfig(); const files = await exists(confined(root, c.source)) ? await walk(c.source) : []; assertIgnored(c, files); console.log('Workspace guard passed. ' + files.length + ' local file(s). This check does not scan Git history or prove encryption correctness.'); }
  else throw new Error('Unknown command. Run gitvault --help');
}
main().catch(error => { console.error('GitVault:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
