import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { createBundle } from '../src/bundle.js';

const rasterizer = process.env.GITVAULT_RSVG_BINARY;
const scanner = process.env.GITVAULT_ZBAR_BINARY;

test('generated QR images decode to the exact public document and folder viewer URLs', {
  skip: (!rasterizer || !scanner) && 'Set GITVAULT_RSVG_BINARY and GITVAULT_ZBAR_BINARY for actual QR image decoding',
}, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gitvault-qr-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cases = [
    { repo: 'example/public-repo', output: 'private', name: 'team/strategy.md', viewer: 'https://junovhs.github.io/gitvault/', ref: 'main' },
    { repo: 'example/public-repo', output: 'private-folders', name: 'private-folder.gvfolder', viewer: 'https://junovhs.github.io/gitvault/folder.html', ref: 'feature/private' },
  ];
  for (const [index, options] of cases.entries()) {
    // Only the public locator is under test. No real document or credential is used.
    const bundle = await createBundle(new Uint8Array([1, 2, 3]), options);
    const svg = path.join(root, index + '.svg'); const png = path.join(root, index + '.png');
    await writeFile(svg, bundle.qr);
    execFileSync(rasterizer!, ['--output', png, svg], { timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
    const scanned = execFileSync(scanner!, ['--quiet', '--raw', png], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.equal(scanned, bundle.url);
    const url = new URL(scanned); const params = new URLSearchParams(url.hash.slice(1));
    assert.equal(url.search, '');
    assert.equal(params.get('repo'), options.repo);
    assert.equal(params.get('file'), options.output + '/' + options.name + '.age');
    assert.equal(params.get('ref'), options.ref);
    assert.deepEqual([...params.keys()].sort(), ['file', 'ref', 'repo']);
    assert.ok(!scanned.includes('AGE-SECRET-KEY-'));
  }
});
