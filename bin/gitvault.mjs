#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 16)) {
  console.error('GitVault requires Node.js 22.16 or newer.');
  process.exit(1);
}
let loader;
try { loader = import.meta.resolve('tsx'); }
catch {
  console.error('GitVault dependencies are missing. Run npm ci in the GitVault checkout first.');
  process.exit(1);
}
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
// Keep the caller's working directory: that is the repository being protected.
const child = spawn(process.execPath, ['--import', loader, cli, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error('Could not start GitVault:', error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  if (signal) process.exitCode = signal === 'SIGINT' ? 130 : 1;
  else process.exitCode = code ?? 1;
});
