# Roadmap

## Milestone 0 — repo bootstrap

- [x] Document product requirements and architecture
- [x] Build first-pass CLI with standard age encryption, QR and landing-page generation
- [x] Build static TypeScript viewer and local encrypt/download form
- [x] Create security model and README
- [ ] Install dependencies and verify compile/runtime compatibility
- [ ] Add comprehensive tests, fixtures and verified end-to-end encryption roundtrip
- [ ] Add protections and recovery for partial file writes and accidental plaintext commits

## Milestone 1 — usable MVP

- [ ] Add safe Markdown preview using a sanitized renderer
- [ ] Make CLI distributable and truly plug-and-play for other repos
- [ ] Support a declarative glob config without exposing plaintext paths to Git
- [ ] CI testing against the official age implementation
- [ ] Deploy free static GitHub Pages site
- [ ] Repo explorer polish, better mobile navigation, rate limit messages
- [ ] Local document edit → re-encrypt and save

## Milestone 2 — keys and folders

- [ ] Random document keys with securely wrapped per-method access
- [ ] Passphrase and public-recipient access to same file with key rotation
- [ ] Private archive/folder tree with hidden filenames
- [ ] Local backup/export of recovery credentials

## Milestone 3 — phone unlocking

- [ ] WebAuthn PRF passkey encryption with compatibility detection and recovery
- [ ] Phone QR opens & decrypts locally
- [ ] QR-assisted desktop unlock using authenticated ephemeral pairing
- [ ] Multiple people per document; recipient management and re-encryption
- [ ] Security audit before recommending real secrets

## Milestone 4 — GitHub integration

- [ ] GitHub authorized commit support, strictly opt-in
- [ ] Checks that only ciphertext and landing files are staged
- [ ] VS Code extension, CLI packaging, Git attribute/filter research
- [ ] Optional local encrypted folder mount and change watcher

## Non-goals

Hosted storage, proprietary encryption, a server that sees passwords, tracking users, or claiming that a QR code alone provides decryption authorization.
