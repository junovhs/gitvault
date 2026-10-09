import assert from 'node:assert/strict';
import { test } from 'node:test';
// The deployment helper is plain Node ESM and deliberately requires no installed packages.
// @ts-expect-error The .mjs helper is validated by these runtime contract tests.
import { sameVerifiedSource } from '../scripts/verified-build.mjs';
const blob = (path: string, sha = 'unchanged', mode = '100644') => ({ path, sha, mode, type: 'blob' });
const tree = (...entries: ReturnType<typeof blob>[]) => ({ tree: entries, truncated: false });

test('deployment permits only generated screenshot gallery differences', () => {
  const before = tree(blob('src/web.ts'), blob('package-lock.json'), blob('docs/screenshots/home.png', 'old'));
  const after = tree(blob('src/web.ts'), blob('package-lock.json'), blob('docs/screenshots/home.png', 'new'), blob('docs/screenshots/README.md'));
  assert.equal(sameVerifiedSource(before, after), true);
});
test('deployment rejects source, dependency, workflow, mode and unrelated doc changes', () => {
  for (const path of ['src/web.ts', 'package-lock.json', 'index.html', '.github/workflows/ci.yml', 'docs/SECURITY.md']) {
    assert.equal(sameVerifiedSource(tree(blob(path, 'before')), tree(blob(path, 'after'))), false);
  }
  assert.equal(sameVerifiedSource(tree(blob('src/web.ts', 'same')), tree(blob('src/web.ts', 'same', '120000'))), false);
});
test('deployment fails closed for truncated or missing Git trees', () => {
  assert.equal(sameVerifiedSource({ tree: [], truncated: true }, tree()), false);
  assert.equal(sameVerifiedSource(null, tree()), false);
  assert.equal(sameVerifiedSource({}, tree()), false);
});
