import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link, stat, truncate, access } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';
import { generateIdentity, identityToRecipient } from 'age-encryption';
import { decrypt } from '../src/crypto.js';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const TSX = import.meta.resolve('tsx');
function git(cwd: string, ...args: string[]): string { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function invoke(cwd: string, args: string[], extra: Record<string, string> = {}) {
  const env = { ...process.env };
  delete env.GITVAULT_PASSPHRASE; delete env.GITVAULT_IDENTITY; delete env.GITVAULT_IDENTITY_FILE;
  const result = spawnSync(process.execPath, ['--import', TSX, CLI, ...args], { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 45000 });
  if (result.error) throw result.error;
  return result;
}
function ok(cwd: string, args: string[], env: Record<string, string> = {}): string {
  const result = invoke(cwd, args, env); assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout;
}
async function missing(file: string): Promise<boolean> { try { await access(file); return false; } catch { return true; } }
async function fixture(t: TestContext, output = 'private') {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gitvault-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'repo'); await mkdir(root);
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'GitVault tests'); git(root, 'config', 'user.email', 'tests@example.invalid');
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/public-vault.git');
  ok(root, ['init']);
  const identity = await generateIdentity(); const recipient = await identityToRecipient(identity);
  const cfg = YAML.parse(await readFile(path.join(root, '.gitvault.yml'), 'utf8'));
  cfg.mode = 'recipient'; cfg.recipient = recipient; cfg.output = output;
  await writeFile(path.join(root, '.gitvault.yml'), YAML.stringify(cfg));
  return { root, temp, identity, recipient, cfg };
}
async function source(root: string, relative: string, content: string | Uint8Array = 'private test content') {
  const file = path.join(root, '.gitvault/plain', relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); return file;
}

test('complete encrypt -> commit -> clone -> decrypt roundtrip without tracked plaintext', async (t) => {
  const { root, temp, identity } = await fixture(t, 'protected-docs');
  const original = '# Private strategy\nThis sentence must never enter a public landing page.';
  await source(root, 'team/strategy.md', original); await source(root, 'attachment.bin', new Uint8Array([0, 255, 42, 128]));
  await mkdir(path.join(root, 'subdir'));
  ok(path.join(root, 'subdir'), ['encrypt', '--stage']);
  const names = git(root, 'diff', '--cached', '--name-only');
  assert.ok(!names.includes('.gitvault/plain'));
  assert.match(names, /protected-docs\/team\/strategy.md.age/);
  const landing = await readFile(path.join(root, 'protected-docs/team/strategy.md'), 'utf8');
  assert.ok(!landing.includes('This sentence must never'));
  assert.match(landing, /\n\n/); assert.match(landing, /strategy.md.qr.svg/);
  const encrypted = await readFile(path.join(root, 'protected-docs/team/strategy.md.age'));
  assert.equal(new TextDecoder().decode(await decrypt(encrypted, { identity })), original);
  git(root, 'add', '.gitignore', '.gitvault.yml'); git(root, 'commit', '-qm', 'Encrypted fixture');
  assert.ok(!git(root, 'ls-files').includes('.gitvault/plain'));
  const clone = path.join(temp, 'clone'); git(temp, 'clone', '-q', root, clone);
  assert.ok(await missing(path.join(clone, '.gitvault/plain/team/strategy.md')));
  ok(clone, ['decrypt'], { GITVAULT_IDENTITY: identity });
  assert.equal(await readFile(path.join(clone, '.gitvault/plain/team/strategy.md'), 'utf8'), original);
  assert.deepEqual(new Uint8Array(await readFile(path.join(clone, '.gitvault/plain/attachment.bin'))), new Uint8Array([0, 255, 42, 128]));
  assert.equal(git(clone, 'status', '--porcelain'), '');
});

test('tracked plaintext aborts encryption before any generated output', async (t) => {
  const { root } = await fixture(t); await source(root, 'secret.md'); git(root, 'add', '-f', '.gitvault/plain/secret.md');
  const result = invoke(root, ['encrypt']); assert.notEqual(result.status, 0); assert.match(result.stderr, /Tracked plaintext/);
  assert.ok(await missing(path.join(root, 'private')));
});

test('ignore exceptions are checked for actual files, not only a probe', async (t) => {
  const { root } = await fixture(t); await source(root, 'leak.md');
  await writeFile(path.join(root, '.gitignore'), '/.gitvault/plain/*\n!/.gitvault/plain/leak.md\n');
  const result = invoke(root, ['encrypt']); assert.notEqual(result.status, 0); assert.match(result.stderr, /not Git-ignored/);
});

test('source root symlinks are rejected', async (t) => {
  const { root, temp } = await fixture(t); const outside = path.join(temp, 'outside'); await mkdir(outside); await writeFile(path.join(outside, 'secret.md'), 'outside data');
  await rm(path.join(root, '.gitvault/plain'), { recursive: true }); await symlink(outside, path.join(root, '.gitvault/plain'), 'dir');
  const result = invoke(root, ['encrypt']); assert.notEqual(result.status, 0); assert.match(result.stderr, /Symlinks/);
});

test('output root symlinks are rejected', async (t) => {
  const { root, temp } = await fixture(t); await source(root, 'secret.md'); const outside = path.join(temp, 'outside'); await mkdir(outside);
  await symlink(outside, path.join(root, 'private'), 'dir');
  const result = invoke(root, ['encrypt']); assert.notEqual(result.status, 0); assert.match(result.stderr, /Symlinks/);
});

test('nested symlinks and hard-linked private files are rejected', async (t) => {
  const { root, temp } = await fixture(t); const outside = path.join(temp, 'outside.txt'); await writeFile(outside, 'test');
  await link(outside, path.join(root, '.gitvault/plain/hardlink.txt'));
  assert.match(invoke(root, ['encrypt']).stderr, /hard-linked/);
  await rm(path.join(root, '.gitvault/plain/hardlink.txt'));
  await symlink(outside, path.join(root, '.gitvault/plain/symlink.txt'));
  assert.match(invoke(root, ['encrypt']).stderr, /Symlinks/);
});

test('generated name collisions are caught before output is written', async (t) => {
  const { root } = await fixture(t); await source(root, 'notes.txt'); await source(root, 'notes.txt.md');
  const result = invoke(root, ['encrypt']); assert.notEqual(result.status, 0); assert.match(result.stderr, /collision/);
  assert.ok(await missing(path.join(root, 'private')));
});

test('unowned output files are not overwritten', async (t) => {
  const { root } = await fixture(t); await source(root, 'secret.md'); await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private/README.md'), 'existing public content');
  assert.match(invoke(root, ['encrypt']).stderr, /unowned/);
  assert.equal(await readFile(path.join(root, 'private/README.md'), 'utf8'), 'existing public content');
});

test('restore refuses to overwrite an existing local file', async (t) => {
  const { root, identity } = await fixture(t); await source(root, 'secret.md', 'original'); ok(root, ['encrypt']);
  await source(root, 'secret.md', 'new unsaved work');
  assert.match(invoke(root, ['decrypt'], { GITVAULT_IDENTITY: identity }).stderr, /Refusing to overwrite/);
  assert.equal(await readFile(path.join(root, '.gitvault/plain/secret.md'), 'utf8'), 'new unsaved work');
});

test('wrong identity does not create partially restored plaintext', async (t) => {
  const { root } = await fixture(t); await source(root, 'one.md'); await source(root, 'two.md'); ok(root, ['encrypt']);
  await rm(path.join(root, '.gitvault/plain'), { recursive: true });
  const wrong = await generateIdentity(); assert.notEqual(invoke(root, ['decrypt'], { GITVAULT_IDENTITY: wrong }).status, 0);
  assert.ok(await missing(path.join(root, '.gitvault/plain/one.md')));
  assert.ok(await missing(path.join(root, '.gitvault/plain/two.md')));
});

test('deleted source is not silently treated as an intended remote deletion', async (t) => {
  const { root } = await fixture(t); await source(root, 'one.md'); await source(root, 'two.md'); ok(root, ['encrypt']);
  const prior = await readFile(path.join(root, 'private/two.md.age')); await rm(path.join(root, '.gitvault/plain/two.md'));
  assert.match(invoke(root, ['encrypt']).stderr, /Source files were removed/);
  assert.deepEqual(await readFile(path.join(root, 'private/two.md.age')), prior);
});

test('local hook uses configured output and blocks plaintext from the commit', async (t) => {
  const { root } = await fixture(t, 'vault-docs'); await source(root, 'hello.md'); ok(root, ['hook', 'install']);
  const hook = await readFile(path.join(root, '.git/hooks/pre-commit'), 'utf8'); assert.ok(hook.startsWith('#!/bin/sh\n')); assert.ok(!hook.includes('\\n'));
  git(root, 'add', '.gitvault.yml', '.gitignore'); git(root, 'commit', '-qm', 'Hook fixture');
  const tracked = git(root, 'ls-files'); assert.match(tracked, /vault-docs\/hello.md.age/); assert.ok(!tracked.includes('.gitvault/plain'));
  assert.notEqual(invoke(root, ['hook', 'install']).status, 0); assert.equal(await readFile(path.join(root, '.git/hooks/pre-commit'), 'utf8'), hook);
});

test('keygen writes only to an ignored private file and prints only the public recipient', async (t) => {
  const { root } = await fixture(t); const stdout = ok(root, ['keygen']);
  assert.match(stdout, /Public recipient: age1/); assert.ok(!stdout.includes('AGE-SECRET-KEY-'));
  const filename = path.join(root, '.gitvault/keys/identity.txt'); assert.match(await readFile(filename, 'utf8'), /AGE-SECRET-KEY-/);
  assert.equal((await stat(filename)).mode & 0o777, 0o600); assert.equal(git(root, 'status', '--porcelain', '--', '.gitvault/keys'), '');
});

test('oversized input is rejected before reading/encrypting it', async (t) => {
  const { root } = await fixture(t); const filename = await source(root, 'huge.bin', ''); await truncate(filename, 17 * 1024 * 1024);
  assert.match(invoke(root, ['encrypt']).stderr, /16 MiB/); assert.ok(await missing(path.join(root, 'private')));
});
