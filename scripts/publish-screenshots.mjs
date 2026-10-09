import { readFile } from 'node:fs/promises';

// Only synthetic screenshots from a successful main-branch browser test run are eligible.
// Never publish screenshots from a user's real encrypted documents.
const names = ['desktop-home.png', 'mobile-home.png', 'locked-document.png', 'unlocked-document.png'];
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const runId = process.env.SCREENSHOT_RUN_ID;
const testedSha = process.env.SCREENSHOT_TESTED_SHA;
if (!repo || !token || !/^\d+$/.test(runId || '') || !/^[a-f0-9]{40}$/.test(testedSha || '')) throw new Error('Missing verified screenshot provenance');
async function api(endpoint, method = 'GET', body) {
  const response = await fetch('https://api.github.com/repos/' + repo + endpoint, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(method + ' ' + endpoint + ' returned ' + response.status);
  return response.status === 204 ? null : response.json();
}
const run = await api('/actions/runs/' + runId);
if (run.conclusion !== 'success' || run.head_branch !== 'main' || run.event !== 'push' || run.head_sha !== testedSha || run.path !== '.github/workflows/ci.yml') throw new Error('The screenshots are not from a successful trusted main-branch verification run');
const reference = await api('/git/ref/heads/main'); const parent = reference.object.sha;
const base = await api('/git/commits/' + parent);
const entries = [];
for (const name of names) {
  const bytes = await readFile('evidence/screenshots/' + name);
  if (bytes.length > 3 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid screenshot: ' + name);
  const blob = await api('/git/blobs', 'POST', { encoding: 'base64', content: bytes.toString('base64') });
  entries.push({ path: 'docs/screenshots/' + name, mode: '100644', type: 'blob', sha: blob.sha });
}
const readme = [
  '# GitVault: real browser screenshots',
  '',
  'These images were captured from the running application, not design mockups. All visible documents and credentials are intentionally public test fixtures.',
  '',
  'Tested source commit: `' + testedSha + '`.',
  '',
  '[Successful browser verification](https://github.com/' + repo + '/actions/runs/' + runId + ')',
  '',
  'The current application can be newer than this screenshot set. Screenshots do not imply physical-phone or passkey-provider compatibility testing.',
  '',
  '## Desktop home', '', '![Desktop home](desktop-home.png)', '',
  '## Mobile-width home', '', '![Mobile layout](mobile-home.png)', '',
  '## Locked document', '', '![Locked document](locked-document.png)', '',
  '## Unlocked document', '', '![Unlocked document](unlocked-document.png)', '',
].join('\n');
entries.push({ path: 'docs/screenshots/README.md', mode: '100644', type: 'blob', content: readme });
const tree = await api('/git/trees', 'POST', { base_tree: base.tree.sha, tree: entries });
if (tree.sha === base.tree.sha) { console.log('Screenshots already published.'); process.exit(0); }
const commit = await api('/git/commits', 'POST', { message: 'docs: publish real desktop, mobile and unlock screenshots', tree: tree.sha, parents: [parent] });
await api('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
console.log('Published screenshot gallery at commit ' + commit.sha);
