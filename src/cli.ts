#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import QRCode from 'qrcode';
import { encrypt, decrypt } from './crypto.js';
import { confined, safeRelative } from './paths.js';
import { landingPage } from './landing.js';

type Config = { version: number; repo: string; viewer: string; source: string; output: string; mode: 'passphrase' | 'recipient'; recipient?: string };
const root = process.cwd();
const configPath = path.join(root, '.gitvault.yml');
function cmd(...args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function assertGitRepo() { cmd('rev-parse', '--show-toplevel'); }
function ensureIgnored(folder: string) {
  const relative = path.relative(root, folder).replaceAll('\\', '/');
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Workspace must be inside repository');
  const probe = relative + '/__gitvault_probe__';
  try { cmd('check-ignore', '-q', probe); } catch { throw Error('Workspace is not Git-ignored. Add ' + relative + '/ to .gitignore before proceeding.'); }
  const tracked = cmd('ls-files', '--', relative);
  if (tracked) throw Error('Tracked plaintext found in workspace. Stop and remove from Git history before continuing.');
}
async function config(): Promise<Config> {
  const cfg = YAML.parse(await readFile(configPath, 'utf8')) as Config;
  if (cfg.version !== 1 || !/^[\\w.-]+\\/[\\w.-]+$/.test(cfg.repo)) throw Error('Invalid version or repo in .gitvault.yml');
  if (!['passphrase', 'recipient'].includes(cfg.mode) || !cfg.source || !cfg.output) throw Error('Invalid config');
  if (cfg.mode === 'recipient' && !cfg.recipient?.startsWith('age1')) throw Error('Recipient encryption requires a public age1... recipient');
  const site = new URL(cfg.viewer);
  if (site.protocol !== 'https:' && site.hostname !== 'localhost') throw Error('Viewer must be HTTPS');
  cfg.source = safeRelative(cfg.source);
  cfg.output = safeRelative(cfg.output);
  if (cfg.source === cfg.output || cfg.output.startsWith(cfg.source + '/') || cfg.source.startsWith(cfg.output + '/')) throw Error('Source and output paths cannot overlap');
  return cfg;
}
async function walk(base: string, current = ''): Promise<string[]> {
  const dir = current ? confined(base, current) : base;
  const files: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error('Symlinks in private workspace are not allowed');
    const rel = current ? current + '/' + item.name : item.name;
    if (item.isDirectory()) files.push(...await walk(base, rel));
    else if (item.isFile()) files.push(safeRelative(rel));
  }
  return files;
}
function getEncryptionSecret(cfg: Config): {passphrase: string} | {recipient: string} {
  if (cfg.mode === 'recipient') return { recipient: cfg.recipient! };
  const passphrase = process.env.GITVAULT_PASSPHRASE;
  if (!passphrase || passphrase.length < 16) throw Error('Set GITVAULT_PASSPHRASE to a strong passphrase (at least 16 characters).');
  return { passphrase };
}
async function protect() {
  assertGitRepo();
  const cfg = await config();
  const source = confined(root, cfg.source);
  const output = confined(root, cfg.output);
  ensureIgnored(source);
  const files = await walk(source);
  const secret = getEncryptionSecret(cfg);
  for (const rel of files) {
    const raw = await readFile(confined(source, rel));
    const encrypted = await encrypt(raw, secret);
    const ciphertextRel = cfg.output + '/' + rel + '.age';
    const ciphertextPath = confined(root, ciphertextRel);
    await mkdir(path.dirname(ciphertextPath), { recursive: true });
    await writeFile(ciphertextPath, encrypted, { flag: 'w', mode: 0o600 });
    const landingPath = confined(output, rel);
    const qrPath = landingPath + '.qr.png';
    const url = new URL(cfg.viewer);
    url.search = new URLSearchParams({ repo: cfg.repo, file: ciphertextRel }).toString();
    await mkdir(path.dirname(landingPath), { recursive: true });
    await QRCode.toFile(qrPath, url.toString(), { margin: 2, width: 270 });
    await writeFile(landingPath, landingPage({ name: path.basename(rel), repo: cfg.repo, viewer: cfg.viewer, ciphertextFile: ciphertextRel, qrFile: path.basename(qrPath) }));
    console.log('Encrypted ' + rel + ' -> ' + ciphertextRel);
  }
}
async function restore() {
  assertGitRepo();
  const cfg = await config();
  const source = confined(root, cfg.source);
  const output = confined(root, cfg.output);
  ensureIgnored(source);
  const secret = process.env.GITVAULT_IDENTITY ? { identity: process.env.GITVAULT_IDENTITY } : { passphrase: process.env.GITVAULT_PASSPHRASE || '' };
  if ('passphrase' in secret && !secret.passphrase) throw Error('Set GITVAULT_PASSPHRASE or GITVAULT_IDENTITY.');
  for (const name of (await walk(output)).filter(f => f.endsWith('.age'))) {
    const raw = await readFile(confined(output, name));
    const plain = await decrypt(raw, secret);
    const dest = confined(source, name.slice(0, -4));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, plain, { flag: 'wx', mode: 0o600 });
    console.log('Restored ' + name.slice(0, -4));
  }
}
async function init() {
  assertGitRepo();
  const repo = (() => { try { return cmd('remote', 'get-url', 'origin').match(/[:/]([^/:]+\\/[^/]+?)(?:\\.git)?$/)?.[1] || 'your-name/your-repo'; } catch { return 'your-name/your-repo'; } })();
  await writeFile(configPath, YAML.stringify({ version: 1, repo, viewer: 'https://junovhs.github.io/gitvault/', source: '.gitvault/plain', output: 'private', mode: 'passphrase' }), { flag: 'wx' });
  const ignore = path.join(root, '.gitignore');
  const previous = fs.existsSync(ignore) ? await readFile(ignore, 'utf8') : '';
  await writeFile(ignore, previous + (previous.endsWith('\n') || !previous ? '' : '\n') + '.gitvault/plain/\n.gitvault/keys/\n');
  await mkdir(path.join(root, '.gitvault/plain'), { recursive: true });
  console.log('Created .gitvault.yml and ignored .gitvault/plain/.');
}
async function hook() {
  assertGitRepo();
  const gitDir = path.resolve(root, cmd('rev-parse', '--git-dir'));
  const hooksDir = path.join(gitDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(hookPath)) throw Error('Existing pre-commit hook found; refusing to overwrite. Add npm run vault:encrypt yourself.');
  await writeFile(hookPath, '#!/bin/sh\\nset -eu\\nnpm run vault:encrypt\\ngit add -- private/ .gitvault.yml\\n', { mode: 0o755 });
  console.log('Installed pre-commit hook; requires npm run vault:encrypt in target repo.');
}
const action = process.argv[2];
try {
  if (action === 'init') await init();
  else if (action === 'encrypt') await protect();
  else if (action === 'decrypt') await restore();
  else if (action === 'hook' && process.argv[3] === 'install') await hook();
  else { console.error('Usage: gitvault <init|encrypt|decrypt|hook install>'); process.exitCode = 2; }
} catch (err) { console.error('GitVault:', err instanceof Error ? err.message : err); process.exitCode = 1; }
