# Test strategy and evidence

## What verification means

The **Verify GitVault** workflow is tied to an exact commit. Success requires the configured build, unit/integration tests, native age compatibility, actual QR-image decoding, dependency audit and browser checks to pass. It is not an independent cryptographic review, penetration test or physical-device certification.

## TypeScript and production build

`npm run build` compiles source and test TypeScript and builds both static entrypoints, `index.html` and `folder.html`. The same built files are used for browser testing and deployment artifacts.

## Node tests

`npm test` uses disposable Git repositories and synthetic keys. It covers encryption, wrong keys and tampering, armored age files, safe paths, bounded filesystem reads, manifest validation, ignored/tracked source checks, write ownership, hook staging, clone/decrypt recovery, filename collisions, terminal input, public bundles, the folder container and deployment guards.

### Reference encryption implementation

Set `GITVAULT_AGE_BINARY=age` to run the native reference check locally. CI installs that binary and does not skip it. GitVault ciphertext is opened by the official age tool, and official armored ciphertext is opened by GitVault.

### Real QR image decoding

The QR check renders the generated SVG using `rsvg-convert`, then decodes the resulting image with `zbarimg`. It asserts the exact public URL, including repository, file and ref, for document and folder bundles. It does not merely check whether an SVG file exists.

CI installs `librsvg2-bin` and `zbar-tools`. Locally, enable the check with `GITVAULT_RSVG_BINARY=rsvg-convert GITVAULT_ZBAR_BINARY=zbarimg npm test`. This is image-decoder evidence, not a claim that every phone camera, display size or lighting condition has been physically tested.

## Chromium full suite

`npm run test:e2e` runs the built UI in Chromium. It exercises real workers, local decryption, wrong passwords/keys, idle locking, GitHub rate limits, branch-preserving navigation, safe Markdown, local editing/re-encryption, ciphertext-only bundles, folder selection/private tree browsing, and keyboard navigation.

WebAuthn tests use a Chromium virtual authenticator. One exposes PRF; another does not. Tests cover creation, passkey encryption/unlock, and independent age recovery after removing the authenticator. This is not iPhone, Android, synced-provider or phone-to-desktop QR certification.

## Firefox and WebKit checks

CI separately runs password and identity unlock, worker execution, safe preview, mobile-width layout and locking in Firefox and WebKit. These are desktop engines on Linux, not physical mobile devices or passkey-provider certifications.

```sh
npx playwright install firefox webkit
GITVAULT_BROWSER=firefox npm run test:e2e
GITVAULT_BROWSER=webkit npm run test:e2e
```

## Audit policy

`npm audit --audit-level=moderate` examines the complete locked dependency tree, including development packages, and fails on reported moderate-or-higher issues. An audit cannot detect every malicious package, unpublished vulnerability or integration bug.

## Evidence artifacts

Successful runs preserve `gitvault-static`, `browser-evidence`, and per-engine compatibility reports. Screenshots use only intentionally public fixtures. The repository gallery refreshes from a successful main run and records the tested commit; it can lag newer unverified changes.

Always inspect the exact commit's Actions result before calling a test passed. A test definition being committed is not proof it ran successfully.
