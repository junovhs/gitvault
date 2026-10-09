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
