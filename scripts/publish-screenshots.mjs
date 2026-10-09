import { readFile } from 'node:fs/promises';

// Only allowlisted screenshots of synthetic fixtures from a successful main run.
const captures = [
  ['desktop-home.png', 'Desktop home', true],
  ['mobile-home.png', 'Mobile-width home', true],
  ['locked-document.png', 'Locked document', true],
  ['unlocked-document.png', 'Unlocked document', true],
  ['unlocked-folder.png', 'Private folder after unlock', false],
  ['passkey-lab.png', 'Passkey lab with verified recovery', false],
  ['chromium-mobile-unlock.png', 'Mobile-width unlocked document', false],
];
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
if (run.conclusion !== 'success' || run.head_branch !== 'main' || run.event !== 'push' || run.head_sha !== testedSha || run.path !== '.github/workflows/ci.yml') throw new Error('Screenshots must come from a successful trusted main-branch verification run');
const reference = await api('/git/ref/heads/main'); const parent = reference.object.sha;
const base = await api('/git/commits/' + parent);
const entries = [];
const sections = [];
for (const [name, title, required] of captures) {
  let bytes;
  try { bytes = await readFile('evidence/screenshots/' + name); }
  catch (error) { if (!required && error.code === 'ENOENT') continue; throw error; }
  if (bytes.length > 3 * 1024 * 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid screenshot: ' + name);
  const blob = await api('/git/blobs', 'POST', { encoding: 'base64', content: bytes.toString('base64') });
  entries.push({ path: 'docs/screenshots/' + name, mode: '100644', type: 'blob', sha: blob.sha });
  sections.push('## ' + title, '', '![' + title + '](' + name + ')', '');
}
const readme = [
  '# GitVault: real browser screenshots', '',
  'These are captures of the running application, not design mockups. All visible documents and credentials are intentionally public test fixtures.', '',
  'Tested source commit: `' + testedSha + '`.', '',
  '[Successful verification and browser tests](https://github.com/' + repo + '/actions/runs/' + runId + ')', '',
  'The gallery updates after successful main-branch verification. Newer unverified commits may not be reflected here. Mobile-width images are browser viewport tests, not physical-phone certification. Passkey tests use a virtual authenticator, not a real phone or provider.', '',
  ...sections,
].join('\n');
entries.push({ path: 'docs/screenshots/README.md', mode: '100644', type: 'blob', content: readme });
const tree = await api('/git/trees', 'POST', { base_tree: base.tree.sha, tree: entries });
if (tree.sha === base.tree.sha) { console.log('Screenshots already published.'); process.exit(0); }
const commit = await api('/git/commits', 'POST', { message: 'docs: refresh verified app, folder and passkey screenshots', tree: tree.sha, parents: [parent] });
await api('/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
console.log('Published screenshot gallery at commit ' + commit.sha);
