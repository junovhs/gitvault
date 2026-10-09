# Changelog

## 0.2.0 prototype — October 9, 2026

### Working document workflow

Added a responsive static repository browser, local encrypted-file opening, password/age-identity unlock, safe Markdown preview, local editing and re-encrypted downloads. Generated GitHub bundles contain only ciphertext, an explanatory Markdown landing page and a public-link SVG QR.

### Local Git integration

Added a no-build CLI launcher, configuration/init, hidden Unicode-safe password prompts, age key generation, ignored-workspace checks, exact generated-file staging and a local pre-commit hook. Restore refuses existing files. Tests exercise a complete encrypt, commit, clone and decrypt workflow in disposable repositories.

### Security and verification

Added bounded input reads, manifest/resource caps, symlink/hardlink rejection, traversal/device-name checks, case/Unicode collision detection, ownership checks, worker timeouts, safe preview and lock controls. Updated the ZIP dependency to a patched version and tightened full-tree dependency audits. Added official age interoperability, real Chromium end-to-end tests, Firefox/WebKit smoke checks and build artifacts.

### Experiments

Added WebAuthn PRF passkeys with a separately downloaded, independently verified age recovery route. Added bounded encrypted folder containers that hide internal names and present a private file tree after unlocking. These features are experimental; virtual authenticator and desktop engine tests do not certify real phones or passkey providers.

### Product and deployment

Added a verified synthetic demo, automatically refreshed real screenshot gallery, keyboard skip navigation, detailed setup/security documentation and a Pages workflow that uses tested artifacts. One repository Pages setting remains necessary before the configured hosted site is live.

### Not included

No custom phone-to-desktop pairing service, no website-held GitHub write token, no direct in-browser GitHub commits, no automatic CLI glob mapping or source pruning, and no independent security audit.
