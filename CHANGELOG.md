# Changelog

## Unreleased — October 9, 2026

### One obvious action per screen

Redesigned the viewer: a single paste-your-repo box, a repository view that leads with its private files, an unlock screen that picks the right method from the file's age header (no method dropdown), a writing sheet with one **Lock it** button, and drag-and-drop for locked files and key files. Pasted GitHub URLs, including branch and folder URLs, are understood.

### Your key, and your phone as a key

Added a personal age identity ("your key"). Setup downloads a standard age identity file and completes only after that exact file is handed back. Notes lock to its public key with no password. Your phone (or this computer) can be added as an unlocker: the identity is wrapped with a WebAuthn PRF passkey created with the `hybrid` hint, so the laptop shows the browser's own QR code and the phone approves with Face ID or a fingerprint. Files stay plain X25519 age files that the age CLI opens with the key file. Only the public key and the passkey-wrapped envelope are stored in the browser; the private key lives in tab memory, locks after 15 idle minutes or when the page is hidden. Physical phones and passkey providers have not been certified.


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
