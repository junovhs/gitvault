import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir, rm, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readBounded, atomicWrite } from '../src/paths.js';
import { safeRelative, canonicalPath } from '../src/locator.js';

test('bounded reads preserve exact content, including empty files, and reject oversized data', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-bounded-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'empty'), ''); await writeFile(path.join(root, 'small'), 'abc');
  assert.equal((await readBounded(root, 'empty', 0)).length, 0);
  assert.equal((await readBounded(root, 'small', 3)).toString(), 'abc');
  await assert.rejects(readBounded(root, 'small', 2), /size limit/);
  await mkdir(path.join(root, 'directory')); await assert.rejects(readBounded(root, 'directory', 100), /regular/);
});
test('bounded reads refuse symlinks and hard links', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-links-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'original'), 'secret'); await symlink(path.join(root, 'original'), path.join(root, 'symbolic'));
  await assert.rejects(readBounded(root, 'symbolic', 100), /Symlinks/);
  await link(path.join(root, 'original'), path.join(root, 'hard'));
  await assert.rejects(readBounded(root, 'hard', 100), /hard-linked/);
});
test('atomic writes replace only their own target', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-atomic-')); t.after(() => rm(root, { recursive: true, force: true }));
  await atomicWrite(root, 'nested/output.age', 'first'); await atomicWrite(root, 'nested/output.age', 'second');
  assert.equal(await readFile(path.join(root, 'nested/output.age'), 'utf8'), 'second');
});
test('portable path policy rejects Windows devices and normalizes collision comparisons', () => {
  for (const value of ['CON', 'a/NUL.txt', 'PRN.md', 'COM1', 'LPT9.pdf', 'aux']) assert.throws(() => safeRelative(value), /Unsafe/);
  assert.equal(canonicalPath('A/Caf\u00e9'), canonicalPath('a/Cafe\u0301'));
  assert.equal(safeRelative('construction.md'), 'construction.md');
});
