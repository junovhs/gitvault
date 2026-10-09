import QRCode from 'qrcode';
import { zipSync, strToU8 } from 'fflate';
import { safeRelative, viewerUrl } from './locator.js';
import { landingPage } from './landing.js';

export type BundleOptions = { repo: string; output: string; name: string; viewer: string; ref?: string };
export async function createBundle(ciphertext: Uint8Array, options: BundleOptions): Promise<{ zip: Uint8Array; url: string; landing: string; qr: string }> {
  const name = safeRelative(options.name);
  const output = safeRelative(options.output);
  const payload = output + '/' + name + '.age';
  const page = output + '/' + (/\.md$/i.test(name) ? name : name + '.md');
  const qrPath = output + '/' + name + '.qr.svg';
  const url = viewerUrl(options.viewer, options.repo, payload, options.ref);
  const qr = await QRCode.toString(url, { type: 'svg', margin: 4, width: 256, errorCorrectionLevel: 'M' });
  const landing = landingPage({ name, ciphertextFile: payload, repo: options.repo, viewer: options.viewer, qrFile: qrPath.split('/').at(-1)!, ref: options.ref });
  // Deliberately include ciphertext and public artifacts only. No plaintext, password or identity.
  const zip = zipSync({ [payload]: ciphertext, [page]: strToU8(landing), [qrPath]: strToU8(qr) }, { level: 0 });
  return { zip, url, landing, qr };
}
