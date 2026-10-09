import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const launcher = fileURLToPath(new URL('../bin/gitvault.mjs', import.meta.url));
test('CLI launcher runs without a build and preserves the target working directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-launcher-')); t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const help = spawnSync(process.execPath, [launcher, '--help'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /GitVault/);
  const init = spawnSync(process.execPath, [launcher, 'init'], { cwd: root, encoding: 'utf8', timeout: 15000 });
  assert.equal(init.status, 0, init.stderr);
  assert.match(await readFile(path.join(root, '.gitvault.yml'), 'utf8'), /source: .gitvault\/plain/);
  assert.match(await readFile(path.join(root, '.gitignore'), 'utf8'), /\.gitvault\/plain/);
});
