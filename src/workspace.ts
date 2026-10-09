/** One file model for the public repository browser; cryptography stays in the existing viewers. */
export type WorkspaceEntry = { name: string; path: string; type: string; size: number };
export type WorkspaceItem = { label: string; detail: string; action: string; href: string; locked: boolean; isFolder: boolean };
export function isConcealedFolder(entry: WorkspaceEntry): boolean {
  return entry.type === 'file' && entry.name.endsWith('.gvfolder.age');
}
export function workspaceItem(repo: string, ref: string, entry: WorkspaceEntry, showGenerated = false): WorkspaceItem {
  const isFolder = entry.type === 'dir';
  const concealed = isConcealedFolder(entry);
  const locked = entry.type === 'file' && entry.name.endsWith('.age');
  const label = concealed && !showGenerated ? entry.name.slice(0, -'.gvfolder.age'.length)
    : locked && !showGenerated ? entry.name.slice(0, -'.age'.length) : entry.name;
  const params = new URLSearchParams({ repo, ...(ref ? { ref } : {}), [isFolder ? 'dir' : 'file']: entry.path });
  return {
    label,
    detail: isFolder ? 'Public folder' : concealed ? 'Private folder · names hidden' : locked ? 'Encrypted document' : 'Public file',
    action: isFolder ? 'Open' : locked ? 'Unlock' : '',
    // Folder containers need the folder viewer; ordinary .age documents need the document viewer.
    href: concealed ? './folder.html#' + params.toString() : '#' + params.toString(),
    locked,
    isFolder,
  };
}
