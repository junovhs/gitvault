# Security model — read before use

**This is an unreviewed prototype; not a production secrets manager.** Do not use it for API credentials or sensitive records without testing and an independent review.

- Public GitHub users can download ciphertext, examine metadata, and keep old versions forever. Password attacks are offline; GitHub rate limits do not help.
- Passwords should be long, random and unique. The CLI enforces only a minimum length of 16, not strength. Do not hard-code passwords or private age identities in scripts/configuration.
- The local source folder must be ignored, must contain no symlinks, and must not already be tracked. The CLI attempts to enforce these constraints, but is not a security boundary against deliberate Git bypasses.
- Hook installation is optional and local. `--no-verify` bypasses the hook. Inspect `git status` and staged changes before committing. Consider repository-level secret scanning as extra defense.
- The browser obtains executable JavaScript from its host. A compromised website, service worker or dependency can leak password/identity input. Treat the browser origin as trusted code. Avoid loading third-party analytics or scripts.
- URLs and QR codes must contain only public repository locators, never secret keys.
- Downloading/revealing decrypted content on a shared machine exposes it to screenshots, extensions, clipboard history, or local malware.
- Public GitHub Contents API limits apply. Directory names and lengths are visible even when bytes are encrypted.
- Loss of passphrase or identity means permanent loss of access unless securely backed up. A future multi-unlock design must include independent recovery before relying on passkeys.
- Changing keys does not revoke access to old ciphertext already copied by prior recipients.
- This proof of concept has not been tested against path traversal, race conditions, symlink attacks, failure during multi-file encryption, binary payload limits, or malicious files; do not consider it hardened.

## Critical quality gate before release

Validate package APIs, run unit and end-to-end tests, audit dependencies, test interoperability with the official age CLI, test interrupted writes, test Git clean/dirty conditions and history leakage, audit any Markdown rendering sanitizer and origin-based WebAuthn support. Enable GitHub Pages only after successful build checks.
