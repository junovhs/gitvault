# Security model

**GitVault is an unaudited prototype.** Automated correctness and regression tests do not establish production security. Use synthetic or low-risk documents first, keep independent backups, and do not use this as a production secrets manager.

## What is protected

The contents of an age-encrypted file are protected by the configured password or authorized recipients, subject to the security of the library, keys and endpoint devices. GitVault does not implement its own cipher. Authentication failures do not reveal partial plaintext in the UI.

The optional folder container puts internal filenames and file bytes inside one age payload. Individual-file mode does not hide filenames. Neither mode hides the outer file's size, public landing metadata, repository history, download timing or copies already retained by others.

## Password and key management

Public ciphertext permits offline password guessing; GitHub's request limits are irrelevant to that attack. Use a long, unique, randomly generated passphrase or a securely backed-up age identity. A 16-character minimum is only a UI guard, not an entropy guarantee. There is no password-reset service.

Keep identities and recovery keys out of Git, config, URLs, QR codes, build logs, screenshots and shared clipboard histories. `keygen` writes a private identity to an ignored local file with restrictive permissions; encryption needs only its public recipient. Back up private identities before relying on them. A newly generated identity cannot recover files encrypted for an old one.

The CLI's interactive prompt does not echo input, handles streaming UTF-8 without normalization, and ignores terminal control sequences. Environment variables are available for noninteractive operation, but the calling shell/process environment is part of the trust boundary.

## Browser trust

Local decryption is not proof that a hosted site is trustworthy. A compromised origin, dependency, browser extension or local OS can steal entered secrets or decrypted content. Review the code and use a trusted origin or local hosting. No application secret persistence, analytics or third-party script CDN is required.

The preview never activates document HTML, images or links. Application navigation clears private DOM content and references; owned byte buffers are overwritten where practical. JavaScript cannot promise forensic erasure of strings, copies held by browser internals, OS memory or screenshots. Downloaded plaintext and exported ZIPs are no longer protected by the viewer.

A displayed link or QR can be replaced by someone who can edit the public repository. Check the viewer hostname before entering a secret. A public QR only locates a file; it does not authorize access or contain a decryption capability.

## Git and filesystem safeguards

The CLI requires source files to be ignored and untracked, checks every actual source path rather than only a probe, and rejects traversal, Git internals, symlinks/hardlinks, case/Unicode name collisions, unsafe device names and overlapping source/output paths. Generated artifacts have an ownership manifest; unknown output files and existing restored plaintext are not silently overwritten.

Configuration, manifests and file reads are bounded. Encryption prepares outputs before modifying generated files. Replacements are atomic per file, not across the whole vault. A crash can still require rerunning encryption and reviewing staged changes. No claim is made against an actively hostile process with the same OS account or arbitrary concurrent filesystem mutation.

Git hooks are local and bypassable. They cannot protect plaintext elsewhere in the repo, erase earlier commits, or stop a deliberate `git add -f`/`--no-verify`. Inspect staged changes. Once plaintext was published, rotate exposed credentials and treat historical copies as compromised; merely deleting a later commit is not enough.

## Passkeys and recovery

Passkey encryption is experimental WebAuthn PRF, not ordinary passkey login. The lab requires a separate age recovery identity and verifies that it decrypts a copy before publishing ciphertext. A downloaded recovery key must be saved privately; the app cannot verify your offline backup merely because a download was requested.

Passkeys are hostname-scoped, not path/repository-scoped. GitHub Pages projects on one hostname share that scope. Trust the entire host. Device/provider compatibility, synchronization and cross-device PRF availability need separate testing. Virtual-authenticator tests are not physical iPhone or Android certification. See [PASSKEYS](PASSKEYS.md).

## Resource limits

The prototype uses 16 MiB per original document, 24 MiB per encrypted file, 64 MiB original contents and 256 files per CLI operation. Config and manifest reads are bounded, directory traversal has depth/entry limits, and password ciphertext above the configured scrypt work-factor policy is rejected. Browser workers have timeouts and only one password/identity operation runs at once.

The folder experiment permits 1–128 files, 8 MiB original contents and a 12 MiB serialized container. It does not decompress untrusted archives or automatically write paths to disk. These limits reduce resource-abuse risk; they are not a comprehensive denial-of-service proof.

## Verification and release limits

CI tests standard age interoperability, wrong-key/tamper rejection, filesystem guards, browser worker execution, local editing/re-encryption, bundle contents and virtual passkeys. Firefox/WebKit smoke checks cover basic unlock paths on Linux engines, not all devices. Dependency audits detect known reported issues at the configured threshold, not malicious unpublished packages or unknown vulnerabilities.

See [TESTING](TESTING.md) and the exact commit's successful Actions run. Independent security review, physical-device testing, recovery usability studies and whole-vault transactional updates remain important work before a production recommendation.
