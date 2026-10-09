import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, truncate, access } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import YAML from 'yaml';
import { generateIdentity, identityToRecipient } from 'age-encryption';

const CLI = fileURLToPath(new URL('../bin/gitvault.mjs', import.meta.url));
function run(root: string, ...args: string[]) {
  const env = { ...process.env }; delete env.GITVAULT_PASSPHRASE; delete env.GITVAULT_IDENTITY; delete env.GITVAULT_IDENTITY_FILE;
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error; return result;
}
async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-safety-')); t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const init = run(root, 'init'); assert.equal(init.status, 0, init.stderr);
  const cfg = YAML.parse(await readFile(path.join(root, '.gitvault.yml'), 'utf8'));
  cfg.mode = 'recipient'; cfg.recipient = await identityToRecipient(await generateIdentity());
  await writeFile(path.join(root, '.gitvault.yml'), YAML.stringify(cfg));
  return { root, cfg };
}

test('removing the final source does not silently approve an empty publish', async t => {
  const { root } = await fixture(t); const plain = path.join(root, '.gitvault/plain/last.md'); await writeFile(plain, 'private fixture');
  const encrypted = run(root, 'encrypt'); assert.equal(encrypted.status, 0, encrypted.stderr);
  const before = await readFile(path.join(root, 'private/last.md.age')); await rm(plain);
  const result = run(root, 'encrypt'); assert.notEqual(result.status, 0); assert.match(result.stderr, /Source files were removed/);
  assert.deepEqual(await readFile(path.join(root, 'private/last.md.age')), before);
});
test('oversized configuration and manifest are rejected before parsing', async t => {
  const { root } = await fixture(t); const cfgPath = path.join(root, '.gitvault.yml'); const original = await readFile(cfgPath);
  await writeFile(cfgPath, '#'.repeat(65537)); assert.match(run(root, 'check').stderr, /size limit/);
  await writeFile(cfgPath, original); await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private/.gitvault-manifest.json'), ' '.repeat(512 * 1024 + 1));
  assert.match(run(root, 'decrypt').stderr, /size limit/);
});
test('case-insensitive source/output aliases are rejected on every platform', async t => {
  const { root, cfg } = await fixture(t); cfg.source = 'Private'; cfg.output = 'private';
  await writeFile(path.join(root, '.gitvault.yml'), YAML.stringify(cfg)); assert.match(run(root, 'check').stderr, /overlap/);
});
test('Unicode-normalized generated filename collisions are rejected', async t => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, '.gitvault/plain/Caf\u00e9.md'), 'first');
  await writeFile(path.join(root, '.gitvault/plain/Cafe\u0301.md'), 'second');
  assert.match(run(root, 'encrypt').stderr, /collision/);
});
test('too many source files fail before any output is generated', async t => {
  const { root } = await fixture(t);
  await Promise.all(Array.from({ length: 257 }, (_, i) => writeFile(path.join(root, '.gitvault/plain/' + i + '.md'), '')));
  assert.match(run(root, 'encrypt').stderr, /256/);
  await assert.rejects(access(path.join(root, 'private')));
});
test('manifest path traversal is never used as a restore destination', async t => {
  const { root } = await fixture(t); await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private/.gitvault-manifest.json'), JSON.stringify({ gitvault: 1, entries: [{ source: '../escape', payload: '../escape.age', landing: '../escape.md', qr: '../escape.qr.svg' }] }));
  const result = run(root, 'decrypt'); assert.notEqual(result.status, 0); assert.match(result.stderr, /Unsafe/);
  await assert.rejects(access(path.join(root, '.gitvault/escape')));
});
test('oversized ciphertext is rejected before requesting any secret', async t => {
  const { root } = await fixture(t); await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private/.gitvault-manifest.json'), JSON.stringify({ gitvault: 1, entries: [{ source: 'x.md', payload: 'x.md.age', landing: 'x.md', qr: 'x.md.qr.svg' }] }));
  const file = path.join(root, 'private/x.md.age'); await writeFile(file, ''); await truncate(file, 25 * 1024 * 1024);
  assert.match(run(root, 'decrypt').stderr, /ciphertext limits/);
});
