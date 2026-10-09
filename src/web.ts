import { Encrypter, Decrypter, generateIdentity, identityToRecipient } from 'age-encryption';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const params = new URLSearchParams(location.search);
const repo = params.get('repo') || '';
const file = params.get('file') || '';
const safeRepo = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) ? repo : '';
const safeFile = file && !file.startsWith('/') && !file.includes('..') && !file.includes('\\') ? file : '';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, fn: () => void | Promise<void>): HTMLButtonElement {
  const b = el('button', text);
  b.addEventListener('click', () => { Promise.resolve(fn()).catch(showError); });
  return b;
}
function showError(e: unknown) { const status = document.querySelector('#status'); if (status) status.textContent = e instanceof Error ? e.message : String(e); }
function field(labelText: string, type = 'text'): HTMLInputElement {
  const label = el('label', labelText);
  const inp = el('input'); inp.type = type; inp.autocomplete = 'off'; label.append(inp); app.append(label); return inp;
}
function download(name: string, bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = el('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function header(title: string, description: string) {
  app.replaceChildren();
  const brand = el('a','◈ GitVault'); brand.href = './'; brand.className = 'brand'; app.append(brand);
  app.append(el('h1', title), el('p', description));
}
async function api(path = ''): Promise<any> {
  const url = 'https://api.github.com/repos/' + safeRepo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!resp.ok) throw new Error('GitHub returned ' + resp.status + '. Public API requests have rate limits.');
  return resp.json();
}
function decodeBase64(encoded: string): Uint8Array {
  const raw = atob(encoded.replace(/\\s/g, ''));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
async function raw(path: string): Promise<Uint8Array> {
  const data = await api(path);
  if (data.type !== 'file' || !data.content || data.encoding !== 'base64') throw new Error('Not a supported GitHub file.');
  return decodeBase64(data.content);
}
async function viewFile(path: string) {
  header(path, 'Files stay on GitHub. Decryption happens on this device, inside your browser.');
  const back = button('← Browse repository', () => { window.location.href = '?repo=' + encodeURIComponent(safeRepo); }); app.append(back);
  const status = el('p'); status.id = 'status'; status.className = 'status'; app.append(status);
  if (!path.endsWith('.age')) {
    const p = el('pre','Loading file…'); app.append(p);
    const bytes = await raw(path);
    p.textContent = decoder.decode(bytes);
    return;
  }
  const encrypted = await raw(path);
  const method = el('select'); for (const [value, title] of [['passphrase', 'Password'], ['identity', 'Private age identity']]) { const opt=el('option',title); opt.value=value; method.append(opt); }
  const label=el('label','Unlock method');label.append(method);app.append(label);
  const secret = field('Password or private identity', 'password');
  const output = el('pre','Encrypted — contents not displayed.'); output.className='document';
  const unlock=button('Unlock locally', async () => {
    status.textContent='Decrypting on this device…';
    output.textContent='';
    const d = new Decrypter();
    if (method.value === 'identity') d.addIdentity(secret.value);
    else d.addPassphrase(secret.value);
    const decrypted = new Uint8Array(await d.decrypt(encrypted));
    const text = decoder.decode(decrypted);
    output.textContent=text;
    status.textContent='Unlocked locally. Avoid shared computers and browser extensions.';
    secret.value='';
  });
  app.append(unlock,output);
}
async function browse(path = '') {
  if (!safeRepo) { header('Open a public repository', 'Browse public files or unlock encrypted documents without an account.'); const inp=field('GitHub repository (owner/name)'); inp.placeholder='owner/repo'; app.append(button('Browse',()=>{if(!/^[\\w.-]+\\/[\\w.-]+$/.test(inp.value))throw Error('Expected owner/repo');location.href='?repo='+encodeURIComponent(inp.value)})); const status=el('p');status.id='status';app.append(status);return; }
  header(safeRepo + (path ? '/' + path : ''), 'GitHub public repository explorer');
  const status=el('p','Loading files…');status.id='status';app.append(status);
  const contents=await api(path);
  if(!Array.isArray(contents)) { await viewFile(path); return; }
  status.textContent='';
  if(path){ const up=path.split('/').slice(0,-1).join('/');app.append(button('← Up one folder',()=>{location.href='?repo='+encodeURIComponent(safeRepo)+(up?'&dir='+encodeURIComponent(up):'');})); }
  const list=el('div'); list.className='file-list';
  for(const f of contents){
    const line=el('a',(f.type==='dir'?'📁 ':'🔒 '.repeat(Number(f.name.endsWith('.age')))||'📄 ')+f.name);
    line.href='?repo='+encodeURIComponent(safeRepo)+(f.type==='dir'?'&dir=':'&file=')+encodeURIComponent(f.path);
    list.append(line);
  }
  app.append(list);
}
function encryptScreen() {
  header('Encrypt a file','Encrypt locally, then commit the downloaded .age file to a public repository.');
  const file = document.createElement('input');file.type='file';const label=el('label','Choose a document');label.append(file);app.append(label);
  const method=el('select'); for(const [v,t] of [['passphrase','Password'],['recipient','Public age recipient']]){const opt=el('option',t);opt.value=v;method.append(opt)}
  const lm=el('label','Encryption method');lm.append(method);app.append(lm);
  const secret=field('Password or public recipient','text');
  app.append(button('Encrypt & download',async()=>{
    if(!file.files?.[0]) throw Error('Choose a file first.');
    const e=new Encrypter();
    if(method.value==='recipient') e.addRecipient(secret.value);
    else { if(secret.value.length<16)throw Error('Choose a strong passphrase (16+ characters).');e.setPassphrase(secret.value); }
    const result=new Uint8Array(await e.encrypt(new Uint8Array(await file.files[0].arrayBuffer())));
    download(file.files[0].name+'.age',result);
    secret.value='';
    const status=document.querySelector('#status');if(status)status.textContent='Encrypted locally and downloaded. No content was uploaded to GitVault.';
  }));
  const status=el('p'); status.id='status';status.className='status';app.append(status);
}
async function main() {
  try { if(params.get('page')==='encrypt') encryptScreen(); else if(safeRepo && safeFile) await viewFile(safeFile); else await browse(params.get('dir')||''); }
  catch(e){showError(e);}
  const nav=el('nav'); const browseLink=el('a','Browse');browseLink.href='./';const encryptLink=el('a','Encrypt');encryptLink.href='?page=encrypt';const github=el('a','Source code'); github.href='https://github.com/junovhs/gitvault';nav.append(browseLink,encryptLink,github);app.prepend(nav);
}
void main();
