# Experimental passkey encryption

The Passkey lab uses the `age-encryption` WebAuthn PRF integration. It is not ordinary passkey login and it does not require a user database. The browser asks a compatible authenticator for credential-bound cryptographic material that protects an age file key.

## What the lab does

1. Create an encryption-capable passkey on the viewer's hostname.
2. Generate an independent standard age identity and public recipient in the browser.
3. Require a separate recovery-key download and a user acknowledgment before encryption.
4. Encrypt the document for **both** the WebAuthn recipient and the age recovery recipient.
5. Decrypt a local verification copy with the recovery identity before offering ciphertext or a public GitHub bundle.

The recovery identity never enters the bundle, URL, QR, GitHub repository, or application storage. The browser holds it in memory until navigation; JavaScript cannot guarantee forensic memory erasure.

## Open it later

In the viewer, select **Passkey (experimental)** and approve the original encryption passkey. For independent recovery, select **Private age identity** and choose the downloaded recovery-key file. The ordinary age CLI can also recover a file through its standard X25519 recipient without WebAuthn support.

A password does not automatically unlock a passkey file. The passkey lab does not invent a custom multi-unlock envelope; it composes supported recipient types in the age format.

## Compatibility and trust boundaries

A browser exposing WebAuthn is not proof that its selected authenticator supports PRF. Creation must confirm PRF support and fail clearly otherwise. A synchronized passkey may depend on its provider and devices; do not assume every cross-device QR flow delivers PRF output. An unavailable passkey must never be the only recovery route.

Passkeys are bound to a relying-party hostname, **not a path or repository**. Projects under the same GitHub Pages hostname share that hostname. Trust all applications served on the chosen host or use a dedicated host. Moving to another hostname may make passkey unlock unavailable; use the independent recovery identity.

This is an experimental implementation, not a hardware compatibility certification. Automated Chromium virtual-authenticator tests exercise PRF, lack of PRF, passkey unlock, and independent recovery. A passed test is not evidence that an iPhone, Android phone, synced credential provider, or phone-to-desktop flow was physically tested.

## QR distinction

The permanent QR in a repository landing page is only a public viewer link. Scanning opens the viewer on the phone and does not unlock another computer. The browser may offer its own cross-device passkey UI, but GitVault does not implement a custom pairing relay or guarantee PRF support through that route.

## References

- [age-encryption implementation](https://github.com/FiloSottile/typage)
- [WebAuthn PRF source](https://github.com/FiloSottile/typage/blob/main/lib/webauthn.ts)
- [WebAuthn PRF extension explainer](https://github.com/w3c/webauthn/wiki/Explainer:-PRF-extension)

## Phone as a key (your key)

This is the everyday path; the lab above remains for files locked directly to a passkey.

1. **Your key** is one standard age X25519 identity. Setup downloads it as `gitvault-key.txt` and finishes only when that exact file is handed back, proving the recovery copy exists.
2. **Add my phone** creates a discoverable WebAuthn credential with the PRF extension, `authenticatorAttachment: cross-platform`, and the WebAuthn Level 3 `hints: ["hybrid"]`, so a desktop browser goes straight to its cross-device QR code. **Use this computer** uses `platform` and `hints: ["client-device"]` (Touch ID, Windows Hello).
3. Your age identity is then encrypted to that credential with the same `age-encryption.org/fido2prf` recipient the lab uses. The resulting armored envelope and the credential descriptor are stored in this browser's `localStorage`, alongside your public key. Nothing secret is stored unencrypted.
4. **Unlock with my phone** asks the browser for the PRF output (the phone approves with Face ID or a fingerprint), decrypts the envelope, checks that the identity matches your stored public key, and keeps it in tab memory. It locks after 15 idle minutes, on **Lock now**, or when the page is hidden.

Files are always encrypted to your **X25519 public key**, never to the passkey, so `age -d -i gitvault-key.txt` opens everything without GitVault, a browser, or the phone.

### Why not a custom pairing protocol

The browser's hybrid transport already provides the right properties: a QR-initiated, Bluetooth-proximity-checked, end-to-end encrypted tunnel between the computer and the phone's platform authenticator. A homemade relay would add a server, a new protocol and new attack surface, which this project does not want.

### Device limitations

- **iPhone**: iCloud Keychain passkeys return PRF results from iOS/iPadOS 18.4 (earlier 18.x had cross-device inconsistencies).
- **Android**: Google Password Manager passkeys support PRF; third-party providers vary.
- **Computer browser**: Chrome/Edge 132+, Safari 18+ on macOS 15+, desktop Firefox 139+. Windows Hello PRF as a *local* authenticator is inconsistent; prefer the phone.
- Creation fails clearly when PRF is not offered; the key file always keeps working.
- Passkeys are scoped to the hostname (`junovhs.github.io`), not the repository. Every page on that host is inside the trust boundary; a dedicated origin is planned.
- The phone stores a passkey, not your files or key. The wrapped envelope lives in each computer's browser, so a new computer needs the key file once, then **Add my phone** again (this creates another passkey on the phone).
- Tested with Chromium's virtual authenticator on the `cable` (hybrid) and `internal` transports, including a no-PRF authenticator. **Not yet tested on a physical iPhone or Android phone.**
