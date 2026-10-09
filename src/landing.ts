import { viewerUrl } from './paths.js';

export function landingPage(opts: { name: string; ciphertextFile: string; repo: string; viewer: string; qrFile: string }): string {
  const url = viewerUrl(opts.viewer, opts.repo, opts.ciphertextFile);
  return [
    '# 🔒 Encrypted document',
    '',
    '**' + opts.name.replaceAll('*', '\\*') + '** is stored encrypted in this public GitHub repository.',
    '',
    'The original contents are not available to the public. You need an authorized password or identity to read them.',
    '',
    '### [Open the secure GitVault viewer](' + url + ')',
    '',
    'Scan this QR code to open the viewer on your phone:',
    '',
    '![' + 'QR code linking to the GitVault viewer' + '](' + encodeURI(opts.qrFile) + ')',
    '',
    '> The QR and URL contain **no password or decryption key**. The viewer retrieves the encrypted file from GitHub and decrypts it locally in your browser.',
    '',
    'Encrypted payload: [download `.age` file](./' + encodeURI(opts.ciphertextFile.split('/').at(-1)!) + ').',
    '',
    'GitHub exposes the filename, size and commit history. Never commit plaintext or private keys.',
    '',
  ].join('\n');
}
