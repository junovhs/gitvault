import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// This maintenance job can update only this explicit list. It never force-pushes.
const allowed = ['package-lock.json', 'examples/private/welcome.md.age', 'examples/private/welcome.md', 'examples/private/welcome.md.qr.svg'];
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repository || !token || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('This script runs only in the main-branch maintenance workflow');
const root = 'https://api.github.com/repos/' + repository;
async function api(endpoint, method = 'GET', body) {
  const response = await fetch(root + endpoint, { method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(method + ' ' + endpoint + ': ' + response.status);
  return response.status === 204 ? null : response.json();
}
const reference = await api('/git/ref/heads/main');
const parent = reference.object.sha;
const commit = await api('/git/commits/' + parent);
// Refuse to pin a lockfile or demo produced from outdated input code.
for (const file of ['package.json', 'scripts/generate-demo.ts', 'src/crypto.ts']) {
  const local = await readFile(file); const hash = createHash('sha1').update('blob ' + local.length + '\0').update(local).digest('hex');
  const remote = await api('/contents/' + file + '?ref=' + parent);
  if (remote.sha !== hash) throw new Error('Source changed while generating artifacts: ' + file + '. Rerun the workflow on current main.');
}
const elements = [];
for (const file of allowed) {
  const content = await readFile(file, 'utf8');
  elements.push({ path: file, mode: '100644', type: 'blob', content });
}
const tree = await api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree: elements });
if (tree.sha === commit.tree.sha) { console.log('Generated files already match.'); process.exit(0); }
const created = await api('/git/commits', 'POST', { message: 'chore: pin dependencies and publish a verified public demo', tree: tree.sha, parents: [parent] });
await api('/git/refs/heads/main', 'PATCH', { sha: created.sha, force: false });
console.log('Committed generated artifacts: ' + created.sha);
