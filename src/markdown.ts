/** A deliberately limited Markdown preview. Never parses HTML, loads media, or activates links. */
function inline(parent: HTMLElement, text: string): void {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  for (const token of tokens) {
    if (token.startsWith('`') && token.endsWith('`')) { const node = document.createElement('code'); node.textContent = token.slice(1, -1); parent.append(node); }
    else if (token.startsWith('**') && token.endsWith('**')) { const node = document.createElement('strong'); node.textContent = token.slice(2, -2); parent.append(node); }
    else parent.append(document.createTextNode(token));
  }
}
export function renderMarkdown(target: HTMLElement, text: string): void {
  target.replaceChildren();
  let code: HTMLPreElement | null = null;
  let list: HTMLUListElement | null = null;
  const lines = text.slice(0, 256000).split(/\r?\n/).slice(0, 3000);
  for (const line of lines) {
    if (line.startsWith('```')) { if (code) code = null; else { code = document.createElement('pre'); target.append(code); } list = null; continue; }
    if (code) { code.append(document.createTextNode(line + '\n')); continue; }
    if (!line.trim()) { list = null; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { const node = document.createElement('h' + heading[1].length); inline(node, heading[2]); target.append(node); list = null; continue; }
    if (/^[-*]\s/.test(line)) {
      if (!list) { list = document.createElement('ul'); target.append(list); }
      const item = document.createElement('li'); inline(item, line.slice(2)); list.append(item); continue;
    }
    list = null;
    const node = document.createElement(line.startsWith('> ') ? 'blockquote' : 'p');
    inline(node, line.startsWith('> ') ? line.slice(2) : line); target.append(node);
  }
  if (text.length > 256000 || lines.length >= 3000) { const note = document.createElement('p'); note.textContent = 'Preview truncated. Download the file for its complete contents.'; target.append(note); }
}
