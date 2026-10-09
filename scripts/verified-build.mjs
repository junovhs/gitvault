/** Compare complete Git trees, allowing only generated screenshot-gallery differences. */
export function sameVerifiedSource(tested, current) {
  if (!tested || !current || tested.truncated || current.truncated || !Array.isArray(tested.tree) || !Array.isArray(current.tree)) return false;
  const fingerprint = value => value.tree
    .filter(entry => entry.type !== 'tree' && !entry.path.startsWith('docs/screenshots/'))
    .map(entry => ({ path: entry.path, mode: entry.mode, type: entry.type, sha: entry.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return JSON.stringify(fingerprint(tested)) === JSON.stringify(fingerprint(current));
}
