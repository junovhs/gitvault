# Roadmap

## Implemented foundation

- [x] Static TypeScript viewer without React, a database or server-side decryption.
- [x] Standard age passwords, recipients, identities and ASCII armor.
- [x] Generated GitHub Markdown landing pages and public-link SVG QR codes.
- [x] Public repository browsing, branch/ref selection, filtering and rate-limit handling.
- [x] Local encrypted-file opening without GitHub requests.
- [x] Safe Markdown preview, local editing and re-encrypted downloads.
- [x] Ciphertext-only GitHub ZIP bundles.
- [x] No-build CLI launcher, ignored workspace, keygen, exact staging and local hook.
- [x] Ownership manifests, bounded reads, path/link/collision guards and restore overwrite refusal.
- [x] Native age interoperability and real Chromium end-to-end checks.
- [x] CI-managed dependency locking, verified public demo and real screenshot gallery.
- [x] Verification-gated static Pages deployment workflow.

## Implemented experiments

- [x] WebAuthn PRF encryption/unlock with an independently verified age recovery route.
- [x] Virtual authenticator tests for PRF success and unsupported-PRF rejection.
- [x] Private folder containers with encrypted internal names and browser tree navigation.
- [x] Firefox and WebKit basic unlock smoke-check configuration.

An implementation or test definition being committed is not proof that every current run passed. See the exact commit's Actions result and [testing scope](TESTING.md).

## Before a production recommendation

- [ ] Independent security and cryptographic integration review.
- [ ] Physical iPhone, Android, security-key and synced-passkey-provider matrix.
- [ ] Recovery usability testing and explicit hostname-migration guidance.
- [ ] Whole-vault transaction/recovery design for interrupted writes.
- [ ] Deliberate source deletion/pruning workflow with preview and confirmation.
- [ ] Windows/macOS CLI and filesystem integration coverage.
- [ ] Dependency maintenance and longer-lived reproducible release artifacts.

## Product expansion

- [ ] Declarative glob/remapping config without exposing plaintext to Git staging.
- [ ] CLI folder-container mode and import of browser-created bundles.
- [ ] Multiple user-managed recipients and explicit recipient-rotation UX.
- [ ] GitHub-authorized commit support, strictly opt-in and ciphertext-only.
- [ ] Authenticated, ephemeral custom phone-to-desktop approval channel.
- [ ] VS Code integration or a local change watcher.
- [ ] Larger-file streaming after resource and interruption behavior are reviewed.

## Explicit non-goals

A server that sees decryption secrets, proprietary cryptography, tracking users, a password-reset backdoor, or pretending that a public QR is authorization. Encryption after a plaintext push is not a safe design.
